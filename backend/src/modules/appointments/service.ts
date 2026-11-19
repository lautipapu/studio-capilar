import { DateTime } from "luxon";
import type { Pool } from "pg";
import type { Clock } from "../../clock.js";
import { pool as defaultPool } from "../../db/pool.js";
import {
  forbidden,
  inactive,
  inactiveService,
  invalidSlot,
  invalidTransition,
  lateCancel,
  notFound,
  outsideHorizon,
  outsideWorkingHours,
  overlap,
  pastDate,
  validationError,
} from "../../errors.js";
import type { AuthUser } from "../../middleware/auth.js";
import { AppointmentsRepository, type DbAppointment } from "./repository.js";

export type AppointmentDto = {
  id: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: "reservado" | "cancelado" | "completado" | "ausente";
  priceCents: number;
  durationMinutes: number;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  clientName?: string;
  professionalName?: string;
  serviceName?: string;
};

function toDto(db: DbAppointment): AppointmentDto {
  return {
    id: db.id,
    clientId: db.client_id,
    professionalId: db.professional_id,
    serviceId: db.service_id,
    startAt: new Date(db.start_at).toISOString(),
    endAt: new Date(db.end_at).toISOString(),
    status: db.status,
    priceCents: db.price_cents,
    durationMinutes: db.duration_minutes,
    cancelledAt: db.cancelled_at ? new Date(db.cancelled_at).toISOString() : null,
    cancelReason: db.cancel_reason,
    clientName: db.client_name,
    professionalName: db.professional_name,
    serviceName: db.service_name,
  };
}

export class AppointmentsService {
  constructor(
    private repo = new AppointmentsRepository(),
    private pool: Pool = defaultPool as any,
  ) {}

  async create(
    data: {
      professionalId: string;
      serviceId: string;
      startAt: string;
      clientId?: string;
    },
    caller: AuthUser,
    clock: Clock,
  ): Promise<AppointmentDto> {
    let effectiveClientId: string;

    if (caller.role === "cliente") {
      // RN12 / CP-28: el cliente solo puede reservar para sí mismo.
      if (data.clientId && data.clientId !== caller.id) {
        throw forbidden("No puede reservar para otro cliente.");
      }
      effectiveClientId = caller.id;
    } else if (caller.role === "administrador") {
      if (!data.clientId) {
        throw validationError("El administrador debe especificar clientId.");
      }
      effectiveClientId = data.clientId;
    } else {
      throw forbidden("El rol profesional no crea reservas directamente.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      // 1. Bloquear la fila del profesional con FOR UPDATE (RN8)
      const profRes = await client.query<{
        id: string;
        prof_active: boolean;
        user_active: boolean;
      }>(
        `SELECT p.id, p.active as prof_active, u.active as user_active
         FROM professionals p
         JOIN users u ON u.id = p.user_id
         WHERE p.id = $1 FOR UPDATE;`,
        [data.professionalId],
      );

      const prof = profRes.rows[0];
      if (!prof) {
        throw notFound("Profesional no encontrado.");
      }
      if (!prof.prof_active || !prof.user_active) {
        throw inactive("El profesional se encuentra inactivo.");
      }

      // 2. Verificar cliente activo (RN17)
      const clientRes = await client.query<{ id: string; active: boolean }>(
        "SELECT id, active FROM users WHERE id = $1;",
        [effectiveClientId],
      );
      const clientUser = clientRes.rows[0];
      if (!clientUser) {
        throw notFound("Cliente no encontrado.");
      }
      if (!clientUser.active) {
        throw inactive("El cliente se encuentra inactivo.");
      }

      // 3. Verificar servicio activo (RN16)
      const serviceRes = await client.query<{
        id: string;
        name: string;
        duration_minutes: number;
        price_cents: number;
        active: boolean;
      }>("SELECT * FROM services WHERE id = $1;", [data.serviceId]);

      const service = serviceRes.rows[0];
      if (!service) {
        throw notFound("Servicio no encontrado.");
      }
      if (!service.active) {
        throw inactiveService("El servicio se encuentra inactivo.");
      }

      // 4. Validar fechas, grilla y horizonte
      const startAtDate = new Date(data.startAt);
      if (isNaN(startAtDate.getTime())) {
        throw validationError("Fecha startAt inválida.");
      }

      // RN1: estrictamente posterior a ahora
      if (startAtDate.getTime() <= clock().getTime()) {
        throw pastDate();
      }

      const ZONE = "America/Argentina/Buenos_Aires";
      const startDt = DateTime.fromJSDate(startAtDate, { zone: ZONE });
      const nowDt = DateTime.fromJSDate(clock(), { zone: ZONE });

      // RN13: grilla de 15 minutos en el reloj local
      if (
        startDt.minute % 15 !== 0 ||
        startDt.second !== 0 ||
        startDt.millisecond !== 0
      ) {
        throw invalidSlot();
      }

      // RN14: horizonte de 30 días locales inclusive
      const today = nowDt.startOf("day");
      const maxDay = today.plus({ days: 30 });
      const appDay = startDt.startOf("day");

      if (appDay < today || appDay > maxDay) {
        throw outsideHorizon();
      }

      // RN3: duración y fin calculados en el servidor
      const durationMinutes = service.duration_minutes;
      const priceCents = service.price_cents;
      const endDt = startDt.plus({ minutes: durationMinutes });
      const endAtDate = endDt.toJSDate();

      // RN4: dentro del horario laboral del profesional
      const weekday = startDt.weekday;
      const schedRes = await client.query<{
        start_time: string;
        end_time: string;
      }>(
        `SELECT start_time::text, end_time::text
         FROM professional_schedules
         WHERE professional_id = $1 AND weekday = $2;`,
        [data.professionalId, weekday],
      );

      const schedule = schedRes.rows[0];
      if (!schedule) {
        throw outsideWorkingHours();
      }

      if (endDt.toISODate() !== startDt.toISODate()) {
        throw outsideWorkingHours();
      }

      const startFormatted = startDt.toFormat("HH:mm");
      const endFormatted = endDt.toFormat("HH:mm");
      const schedStart = schedule.start_time.slice(0, 5);
      const schedEnd = schedule.end_time.slice(0, 5);

      if (startFormatted < schedStart || endFormatted > schedEnd) {
        throw outsideWorkingHours();
      }

      // 5. Verificar solape con bloqueos (RN5)
      const blockOverlap = await client.query(
        `SELECT id FROM time_blocks
         WHERE professional_id = $1 AND start_at < $3 AND end_at > $2
         LIMIT 1;`,
        [data.professionalId, startAtDate, endAtDate],
      );
      if (blockOverlap.rows.length > 0) {
        throw overlap("El turno se superpone con un bloqueo del profesional.");
      }

      // 6. Verificar solape con turnos reservados (RN2)
      const appOverlap = await client.query(
        `SELECT id FROM appointments
         WHERE professional_id = $1 AND status = 'reservado'
           AND start_at < $3 AND end_at > $2
         LIMIT 1;`,
        [data.professionalId, startAtDate, endAtDate],
      );
      if (appOverlap.rows.length > 0) {
        throw overlap();
      }

      // 7. Insertar turno en appointments (la restricción appointments_no_overlap protege la concurrencia)
      const insertRes = await client.query<DbAppointment>(
        `INSERT INTO appointments (
           client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes
         ) VALUES ($1, $2, $3, $4, $5, 'reservado', $6, $7)
         RETURNING *;`,
        [
          effectiveClientId,
          data.professionalId,
          data.serviceId,
          startAtDate,
          endAtDate,
          priceCents,
          durationMinutes,
        ],
      );

      await client.query("COMMIT;");
      return toDto(insertRes.rows[0]!);
    } catch (err: any) {
      await client.query("ROLLBACK;");
      if (err.code === "23P01") {
        throw overlap();
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async list(
    caller: AuthUser,
    filters: {
      from?: string;
      to?: string;
      status?: string;
      clientId?: string;
      professionalId?: string;
    },
    clock: Clock,
  ): Promise<AppointmentDto[]> {
    let clientIdFilter = filters.clientId;
    let professionalIdFilter = filters.professionalId;

    // RN12: Filtros forzados por rol
    if (caller.role === "cliente") {
      clientIdFilter = caller.id;
      professionalIdFilter = undefined;
    } else if (caller.role === "profesional") {
      if (!caller.professionalId) return [];
      professionalIdFilter = caller.professionalId;
      clientIdFilter = undefined;
    }

    const ZONE = "America/Argentina/Buenos_Aires";
    const nowDt = DateTime.fromJSDate(clock(), { zone: ZONE });

    const fromDate = filters.from
      ? new Date(filters.from)
      : nowDt.startOf("day").toJSDate();

    const toDate = filters.to
      ? new Date(filters.to)
      : nowDt.startOf("day").plus({ days: 30 }).endOf("day").toJSDate();

    const list = await this.repo.list({
      clientId: clientIdFilter,
      professionalId: professionalIdFilter,
      status: filters.status,
      from: fromDate,
      to: toDate,
    });

    return list.map(toDto);
  }

  async getById(id: string, caller: AuthUser): Promise<AppointmentDto> {
    const app = await this.repo.findById(id);
    if (!app) {
      throw notFound("Turno no encontrado.");
    }

    // RN12: validación de alcance
    if (caller.role === "cliente" && app.client_id !== caller.id) {
      throw forbidden("No tiene permiso para ver este turno.");
    }

    if (
      caller.role === "profesional" &&
      app.professional_id !== caller.professionalId
    ) {
      throw forbidden("No tiene permiso para ver este turno.");
    }

    return toDto(app);
  }

  async cancel(
    id: string,
    caller: AuthUser,
    reason: string | undefined,
    clock: Clock,
  ): Promise<AppointmentDto> {
    // RN7: el profesional no cancela turnos
    if (caller.role === "profesional") {
      throw forbidden("El profesional no puede cancelar turnos.");
    }

    const app = await this.repo.findById(id);
    if (!app) {
      throw notFound("Turno no encontrado.");
    }

    // Solo desde reservado (RN7, RN9)
    if (app.status !== "reservado") {
      throw invalidTransition("Solo se pueden cancelar turnos reservados.");
    }

    if (caller.role === "cliente") {
      if (app.client_id !== caller.id) {
        throw forbidden("No tiene permiso para cancelar este turno.");
      }

      // RN7: cliente con al menos 24 horas de anticipación
      const diffMs = new Date(app.start_at).getTime() - clock().getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      // Exactamente 24 horas es válido
      if (diffHours < 24) {
        throw lateCancel();
      }
    }

    const updated = await this.repo.updateStatus(id, "cancelado", {
      cancelledAt: clock(),
      cancelReason: reason || null,
    });

    return toDto(updated!);
  }

  async complete(
    id: string,
    caller: AuthUser,
    clock: Clock,
  ): Promise<AppointmentDto> {
    if (caller.role === "cliente") {
      throw forbidden("Un cliente no puede completar turnos.");
    }

    const app = await this.repo.findById(id);
    if (!app) {
      throw notFound("Turno no encontrado.");
    }

    if (
      caller.role === "profesional" &&
      app.professional_id !== caller.professionalId
    ) {
      throw forbidden("No puede cerrar un turno de otro profesional.");
    }

    if (app.status !== "reservado") {
      throw invalidTransition("Solo se pueden completar turnos en estado reservado.");
    }

    // RN10: inicio <= reloj
    if (new Date(app.start_at).getTime() > clock().getTime()) {
      throw invalidTransition(
        "No se puede completar un turno antes de su inicio.",
      );
    }

    const updated = await this.repo.updateStatus(id, "completado");
    return toDto(updated!);
  }

  async noShow(
    id: string,
    caller: AuthUser,
    clock: Clock,
  ): Promise<AppointmentDto> {
    if (caller.role === "cliente") {
      throw forbidden("Un cliente no puede marcar ausencias.");
    }

    const app = await this.repo.findById(id);
    if (!app) {
      throw notFound("Turno no encontrado.");
    }

    if (
      caller.role === "profesional" &&
      app.professional_id !== caller.professionalId
    ) {
      throw forbidden("No puede marcar ausente un turno de otro profesional.");
    }

    if (app.status !== "reservado") {
      throw invalidTransition("Solo se puede marcar ausente un turno reservado.");
    }

    // RN10: inicio <= reloj
    if (new Date(app.start_at).getTime() > clock().getTime()) {
      throw invalidTransition(
        "No se puede marcar ausente un turno antes de su inicio.",
      );
    }

    const updated = await this.repo.updateStatus(id, "ausente");
    return toDto(updated!);
  }
}
