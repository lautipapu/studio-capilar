import bcrypt from "bcryptjs";
import { DateTime } from "luxon";
import type { Pool } from "pg";
import type { Clock } from "../../clock.js";
import { pool as defaultPool } from "../../db/pool.js";
import {
  emailTaken,
  invalidBlock,
  notFound,
  overlap,
  validationError,
} from "../../errors.js";
import { ServicesRepository } from "../services/repository.js";
import {
  ProfessionalsRepository,
  type DbProfessional,
  type DbSchedule,
  type DbTimeBlock,
} from "./repository.js";

export type ProfessionalPublicDto = {
  id: string;
  name: string;
  bio: string;
};

export type ProfessionalDetailDto = {
  id: string;
  name: string;
  bio: string;
  active: boolean;
  email?: string;
  phone?: string | null;
  schedule: {
    weekday: number;
    startTime: string;
    endTime: string;
  }[];
};

export class ProfessionalsService {
  constructor(
    private repo = new ProfessionalsRepository(),
    private servicesRepo = new ServicesRepository(),
    private pool: Pool = defaultPool as any,
  ) {}

  async list(includeInactive = false): Promise<any[]> {
    const list = await this.repo.list(includeInactive);
    if (!includeInactive) {
      return list.map((p) => ({
        id: p.id,
        name: p.name,
        bio: p.bio,
      }));
    }
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      bio: p.bio,
      active: p.active && p.user_active,
    }));
  }

  async getById(id: string, isAdmin = false): Promise<ProfessionalDetailDto> {
    const p = await this.repo.findById(id);
    if (!p) {
      throw notFound("Profesional no encontrado.");
    }

    const isActive = p.active && p.user_active;
    if (!isActive && !isAdmin) {
      throw notFound("Profesional no encontrado.");
    }

    const schedules = await this.repo.getSchedule(id);

    return {
      id: p.id,
      name: p.name,
      bio: p.bio,
      active: isActive,
      ...(isAdmin ? { email: p.email, phone: p.phone } : {}),
      schedule: schedules.map((s) => ({
        weekday: s.weekday,
        startTime: s.start_time,
        endTime: s.end_time,
      })),
    };
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    phone?: string | null;
    bio?: string;
  }): Promise<{ id: string; name: string; email: string; bio: string }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const existing = await client.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1;",
        [data.email.toLowerCase().trim()],
      );
      if (existing.rows.length > 0) {
        throw emailTaken();
      }

      const passwordHash = await bcrypt.hash(data.password, 10);
      const userRes = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, name, phone, role, active)
         VALUES ($1, $2, $3, $4, 'profesional', true)
         RETURNING id;`,
        [
          data.email.toLowerCase().trim(),
          passwordHash,
          data.name.trim(),
          data.phone ? data.phone.trim() : null,
        ],
      );
      const userId = userRes.rows[0]!.id;

      const profRes = await client.query<{ id: string }>(
        `INSERT INTO professionals (user_id, bio, active)
         VALUES ($1, $2, true)
         RETURNING id;`,
        [userId, data.bio ? data.bio.trim() : ""],
      );
      const profId = profRes.rows[0]!.id;

      // Horario inicial por defecto (D10 / spec):
      // Lunes a viernes 09:00 a 18:00, Sábado 09:00 a 13:00, Domingo cerrado
      for (let weekday = 1; weekday <= 5; weekday++) {
        await client.query(
          `INSERT INTO professional_schedules (professional_id, weekday, start_time, end_time)
           VALUES ($1, $2, '09:00', '18:00');`,
          [profId, weekday],
        );
      }
      await client.query(
        `INSERT INTO professional_schedules (professional_id, weekday, start_time, end_time)
         VALUES ($1, 6, '09:00', '13:00');`,
        [profId],
      );

      await client.query("COMMIT;");
      return {
        id: profId,
        name: data.name,
        email: data.email,
        bio: data.bio || "",
      };
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async update(
    id: string,
    data: {
      name?: string;
      phone?: string | null;
      bio?: string;
      active?: boolean;
    },
  ): Promise<any> {
    const updated = await this.repo.update(id, data);
    if (!updated) {
      throw notFound("Profesional no encontrado.");
    }
    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      bio: updated.bio,
      active: updated.active && updated.user_active,
    };
  }

  async replaceSchedule(
    id: string,
    days: { weekday: number; startTime: string; endTime: string }[],
  ): Promise<{ days: { weekday: number; startTime: string; endTime: string }[] }> {
    const prof = await this.repo.findById(id);
    if (!prof) throw notFound("Profesional no encontrado.");

    const weekdays = new Set<number>();
    for (const d of days) {
      if (weekdays.has(d.weekday)) {
        throw validationError("No se pueden repetir días en el horario semanal.");
      }
      weekdays.add(d.weekday);

      if (d.startTime >= d.endTime) {
        throw validationError(
          "La hora de inicio debe ser anterior a la hora de fin.",
        );
      }
    }

    const saved = await this.repo.replaceSchedule(id, days);
    return {
      days: saved.map((s) => ({
        weekday: s.weekday,
        startTime: s.start_time,
        endTime: s.end_time,
      })),
    };
  }

  // --- Bloqueos ---
  async listBlocks(
    professionalId: string,
    fromStr: string,
    toStr: string,
  ): Promise<DbTimeBlock[]> {
    const from = new Date(fromStr);
    const to = new Date(toStr);
    return this.repo.listBlocks(professionalId, from, to);
  }

  async createBlock(
    professionalId: string,
    data: { startAt: string; endAt: string; reason?: string },
    createdBy: string,
    clock: Clock,
  ): Promise<DbTimeBlock> {
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    const now = clock();

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw validationError("Fechas de bloqueo inválidas.");
    }

    if (endAt.getTime() <= startAt.getTime()) {
      throw invalidBlock("El fin del bloqueo debe ser posterior al inicio.");
    }

    if (endAt.getTime() <= now.getTime()) {
      throw invalidBlock("El fin del bloqueo debe ser futuro.");
    }

    const durationMinutes = (endAt.getTime() - startAt.getTime()) / 60000;
    if (durationMinutes < 15) {
      throw invalidBlock("La duración mínima de un bloqueo es de 15 minutos.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const profLock = await client.query(
        "SELECT id FROM professionals WHERE id = $1 FOR UPDATE;",
        [professionalId],
      );
      if (profLock.rows.length === 0) {
        throw notFound("Profesional no encontrado.");
      }

      // Comprobar solapamiento con turnos 'reservado' existentes (RN5, CP-16)
      const overlapApp = await client.query(
        `SELECT id FROM appointments
         WHERE professional_id = $1 AND status = 'reservado'
           AND start_at < $3 AND end_at > $2
         LIMIT 1;`,
        [professionalId, startAt, endAt],
      );

      if (overlapApp.rows.length > 0) {
        throw overlap("No se puede crear un bloqueo encima de un turno reservado.");
      }

      const res = await client.query<DbTimeBlock>(
        `INSERT INTO time_blocks (professional_id, start_at, end_at, reason, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *;`,
        [
          professionalId,
          startAt,
          endAt,
          data.reason ? data.reason.trim() : "",
          createdBy,
        ],
      );

      await client.query("COMMIT;");
      return res.rows[0]!;
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteBlock(
    professionalId: string,
    blockId: string,
    clock: Clock,
  ): Promise<void> {
    const block = await this.repo.findBlockById(blockId);
    if (!block || block.professional_id !== professionalId) {
      throw notFound("Bloqueo no encontrado.");
    }

    if (new Date(block.end_at).getTime() <= clock().getTime()) {
      throw invalidBlock("No se puede borrar un bloqueo ya finalizado.");
    }

    await this.repo.deleteBlock(blockId);
  }

  // --- Disponibilidad ---
  async getAvailability(
    professionalId: string,
    serviceId: string,
    dateStr: string,
    clock: Clock,
  ): Promise<{ slots: string[] }> {
    const prof = await this.repo.findById(professionalId);
    if (!prof || !prof.active || !prof.user_active) {
      throw notFound("Profesional no encontrado o inactivo.");
    }

    const service = await this.servicesRepo.findById(serviceId);
    if (!service || !service.active) {
      return { slots: [] };
    }

    const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
    if (!dateMatch) {
      throw validationError("Formato de fecha inválido. Se espera YYYY-MM-DD.");
    }

    const ZONE = "America/Argentina/Buenos_Aires";
    const nowDt = DateTime.fromJSDate(clock(), { zone: ZONE });
    const today = nowDt.startOf("day");
    const targetDay = DateTime.fromISO(dateStr, { zone: ZONE });
    const maxDay = today.plus({ days: 30 });

    if (targetDay < today || targetDay > maxDay) {
      return { slots: [] };
    }

    const weekday = targetDay.weekday; // 1 (Mon) to 7 (Sun)
    const schedules = await this.repo.getSchedule(professionalId);
    const daySchedule = schedules.find((s) => s.weekday === weekday);
    if (!daySchedule) {
      return { slots: [] };
    }

    const [startHour, startMin] = daySchedule.start_time.split(":").map(Number);
    const [endHour, endMin] = daySchedule.end_time.split(":").map(Number);

    const dayStartDt = targetDay.set({
      hour: startHour,
      minute: startMin,
      second: 0,
      millisecond: 0,
    });
    const dayEndDt = targetDay.set({
      hour: endHour,
      minute: endMin,
      second: 0,
      millisecond: 0,
    });

    // Cargar turnos y bloqueos de ese día
    const appsRes = await this.pool.query<{ start_at: Date; end_at: Date }>(
      `SELECT start_at, end_at FROM appointments
       WHERE professional_id = $1 AND status = 'reservado'
         AND start_at < $3 AND end_at > $2;`,
      [professionalId, dayStartDt.toJSDate(), dayEndDt.toJSDate()],
    );

    const blocksRes = await this.pool.query<{ start_at: Date; end_at: Date }>(
      `SELECT start_at, end_at FROM time_blocks
       WHERE professional_id = $1
         AND start_at < $3 AND end_at > $2;`,
      [professionalId, dayStartDt.toJSDate(), dayEndDt.toJSDate()],
    );

    const appointments = appsRes.rows.map((r) => ({
      start: new Date(r.start_at).getTime(),
      end: new Date(r.end_at).getTime(),
    }));

    const blocks = blocksRes.rows.map((r) => ({
      start: new Date(r.start_at).getTime(),
      end: new Date(r.end_at).getTime(),
    }));

    const slots: string[] = [];
    const durationMinutes = service.duration_minutes;

    let currentSlot = dayStartDt;
    while (currentSlot < dayEndDt) {
      const slotEnd = currentSlot.plus({ minutes: durationMinutes });

      // No puede superar el horario laboral ni cruzar el día
      if (slotEnd > dayEndDt || slotEnd.toISODate() !== currentSlot.toISODate()) {
        break;
      }

      const slotStartMs = currentSlot.toJSDate().getTime();
      const slotEndMs = slotEnd.toJSDate().getTime();

      // RN1: estrictamente futuro
      if (slotStartMs > clock().getTime()) {
        // Comprobar solape con turnos reservados
        const overlapsApp = appointments.some(
          (a) => slotStartMs < a.end && slotEndMs > a.start,
        );

        // Comprobar solape con bloqueos
        const overlapsBlock = blocks.some(
          (b) => slotStartMs < b.end && slotEndMs > b.start,
        );

        if (!overlapsApp && !overlapsBlock) {
          slots.push(currentSlot.toUTC().toISO()!);
        }
      }

      currentSlot = currentSlot.plus({ minutes: 15 });
    }

    return { slots };
  }
}
