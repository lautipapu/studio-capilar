import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createToken } from "../src/middleware/auth.js";
import {
  closeTestPool,
  createFixedClock,
  getTestPool,
  isDatabaseAvailable,
  resetDatabase,
  setupTestDatabase,
} from "./helpers.js";

describe("T08 — Reservas y Concurrencia (CP-14, CP-19 a CP-28)", () => {
  let dbAvailable = false;
  // Reloj fijo: Martes 1 de Diciembre de 2026, 08:00 hora de Buenos Aires (11:00 UTC)
  const fixedClock = createFixedClock("2026-12-01T11:00:00Z");
  const app = createApp({ clock: fixedClock, pool: getTestPool() });

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) {
      throw new Error("La base de datos de pruebas no está disponible; no se pueden ejecutar las pruebas de reservas.");
    }
    await setupTestDatabase();
  });

  afterAll(async () => {
    await closeTestPool();
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await resetDatabase();
    }
  });

  describe("Integración con base de datos real", () => {
    let adminToken: string;
    let client1Id: string;
    let client1Token: string;
    let client2Id: string;
    let client2Token: string;
    let profId: string;
    let serviceId: string;

    beforeEach(async () => {
      if (!dbAvailable) return;
      const pool = getTestPool();
      const hash = await bcrypt.hash("clave1234", 10);

      // Admin
      const aRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('admin@studio.local', '${hash}', 'Admin', 'administrador', true) RETURNING id;
      `);
      adminToken = createToken({ id: aRes.rows[0]!.id, role: "administrador" });

      // Cliente 1
      const c1Res = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('c1@studio.local', '${hash}', 'Cliente Uno', 'cliente', true) RETURNING id;
      `);
      client1Id = c1Res.rows[0]!.id;
      client1Token = createToken({ id: client1Id, role: "cliente" });

      // Cliente 2
      const c2Res = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('c2@studio.local', '${hash}', 'Cliente Dos', 'cliente', true) RETURNING id;
      `);
      client2Id = c2Res.rows[0]!.id;
      client2Token = createToken({ id: client2Id, role: "cliente" });

      // Profesional con horario martes (2) de 10:00 a 14:00 hora de Buenos Aires (13:00 a 17:00 UTC)
      const uRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('pro.booking@studio.local', '${hash}', 'Pro Booking', 'profesional', true) RETURNING id;
      `);
      const pRes = await pool.query<{ id: string }>(`
        INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
      `, [uRes.rows[0]!.id]);
      profId = pRes.rows[0]!.id;

      await pool.query(`
        INSERT INTO professional_schedules (professional_id, weekday, start_time, end_time)
        VALUES ($1, 2, '10:00', '14:00');
      `, [profId]);

      // Servicio activo de 45 min y 900.000 centavos ($9.000)
      const sRes = await pool.query<{ id: string }>(`
        INSERT INTO services (name, duration_minutes, price_cents, active)
        VALUES ('Corte Estilo', 45, 900000, true) RETURNING id;
      `);
      serviceId = sRes.rows[0]!.id;
    });

    it(
      "CP-19: Reserva válida copia precio y duración del catálogo e ignora datos extras del cliente",
      async () => {
        // 10:00 hora local de Buenos Aires = 13:00 UTC
        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:00:00.000Z",
            priceCents: 50, // intento de alterar precio
            durationMinutes: 10, // intento de alterar duración
          });

        expect(res.status).toBe(201);
        expect(res.body.status).toBe("reservado");
        expect(res.body.priceCents).toBe(900000); // precio oficial del catálogo
        expect(res.body.durationMinutes).toBe(45); // duración oficial
        expect(res.body.startAt).toBe("2026-12-01T13:00:00.000Z");
        expect(res.body.endAt).toBe("2026-12-01T13:45:00.000Z");
      },
    );

    it(
      "CP-20: Inicio anterior o igual al reloj responde 422 PAST_DATE",
      async () => {
        // Reloj fijo: 11:00 UTC. Se intenta reservar a las 10:00 UTC (pasado)
        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T10:00:00.000Z",
          });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("PAST_DATE");
      },
    );

    it(
      "CP-21: Servicio inactivo responde 422 INACTIVE_SERVICE",
      async () => {
        const pool = getTestPool();
        await pool.query("UPDATE services SET active = false WHERE id = $1;", [
          serviceId,
        ]);

        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:00:00.000Z",
          });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("INACTIVE_SERVICE");
      },
    );

    it(
      "CP-22: Cliente inactivo responde 422 INACTIVE al reservar",
      async () => {
        const pool = getTestPool();
        await pool.query("UPDATE users SET active = false WHERE id = $1;", [
          client2Id,
        ]);

        // El admin intenta reservar para el cliente 2 inactivo
        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            clientId: client2Id,
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:00:00.000Z",
          });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("INACTIVE");
      },
    );

    it(
      "CP-23: Inicio más allá de hoy + 30 días responde 422 OUTSIDE_HORIZON",
      async () => {
        // Hoy es 2026-12-01. Hoy + 31 días es 2027-01-01
        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2027-01-01T13:00:00.000Z",
          });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("OUTSIDE_HORIZON");
      },
    );

    it(
      "CP-24: Inicio fuera de grilla (ej. 10:10) responde 422 INVALID_SLOT",
      async () => {
        // 10:10 hora de Buenos Aires = 13:10 UTC
        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:10:00.000Z",
          });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("INVALID_SLOT");
      },
    );

    it(
      "CP-14: Reserva fuera de horario laboral responde 422 OUTSIDE_WORKING_HOURS",
      async () => {
        // El horario termina a las 14:00 (17:00 UTC). Un turno de 45m a las 13:30 (16:30 UTC) termina 17:15 UTC (fuera de horario)
        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T16:30:00.000Z",
          });

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("OUTSIDE_WORKING_HOURS");
      },
    );

    it(
      "CP-25: Turno solapado responde 409 OVERLAP",
      async () => {
        // Primer cliente reserva 10:00 a 10:45 local (13:00 a 13:45 UTC)
        await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:00:00.000Z",
          });

        // Segundo cliente intenta reservar 10:30 local (13:30 UTC)
        const res2 = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client2Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:30:00.000Z",
          });

        expect(res2.status).toBe(409);
        expect(res2.body.error.code).toBe("OVERLAP");
      },
    );

    it(
      "CP-26: Turno que solo toca el extremo responde 201 (no es solape)",
      async () => {
        // Primer turno: 13:00 a 13:45 UTC
        await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:00:00.000Z",
          });

        // Segundo turno: arranca exactamente a las 13:45 UTC
        const res2 = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client2Token}`)
          .send({
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T13:45:00.000Z",
          });

        expect(res2.status).toBe(201);
      },
    );

    it(
      "CP-27: Dos reservas simultáneas (Promise.all) dejan exactamente 1 turno y responden 201 y 409",
      async () => {
        const targetSlot = "2026-12-01T14:00:00.000Z";

        const [resA, resB] = await Promise.all([
          request(app)
            .post("/api/appointments")
            .set("Authorization", `Bearer ${client1Token}`)
            .send({
              professionalId: profId,
              serviceId: serviceId,
              startAt: targetSlot,
            }),
          request(app)
            .post("/api/appointments")
            .set("Authorization", `Bearer ${client2Token}`)
            .send({
              professionalId: profId,
              serviceId: serviceId,
              startAt: targetSlot,
            }),
        ]);

        const statuses = [resA.status, resB.status].sort();
        expect(statuses).toEqual([201, 409]);

        const overlapRes = resA.status === 409 ? resA : resB;
        expect(overlapRes.body.error.code).toBe("OVERLAP");

        // Verificar que exactamente un turno quedó registrado en base
        const pool = getTestPool();
        const countRes = await pool.query<{ count: string }>(
          `SELECT count(*) FROM appointments
           WHERE professional_id = $1 AND start_at = $2 AND status = 'reservado';`,
          [profId, targetSlot],
        );
        expect(Number(countRes.rows[0]?.count)).toBe(1);
      },
    );

    it(
      "CP-28: El cliente no puede reservar para otro (responde 403 FORBIDDEN sin crear turno)",
      async () => {
        const res = await request(app)
          .post("/api/appointments")
          .set("Authorization", `Bearer ${client1Token}`)
          .send({
            clientId: client2Id, // intenta reservar para cliente 2
            professionalId: profId,
            serviceId: serviceId,
            startAt: "2026-12-01T15:00:00.000Z",
          });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );
  });
});
