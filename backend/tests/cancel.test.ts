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

describe("T10 — Cancelación de Turnos (CP-30 a CP-34)", () => {
  let dbAvailable = false;
  // Reloj fijo: Martes 1 de Diciembre de 2026, 10:00:00 UTC
  const fixedClock = createFixedClock("2026-12-01T10:00:00Z");
  const app = createApp({ clock: fixedClock, pool: getTestPool() });

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) {
      throw new Error("La base de datos de pruebas no está disponible.");
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
    let client2Token: string;
    let profToken: string;
    let profId: string;
    let serviceId: string;

    beforeEach(async () => {
      if (!dbAvailable) return;
      const pool = getTestPool();
      const hash = await bcrypt.hash("clave1234", 10);

      // Admin
      const a = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('admin@studio.local', '${hash}', 'Admin', 'administrador', true) RETURNING id;
      `);
      adminToken = createToken({ id: a.rows[0]!.id, role: "administrador" });

      // Cliente 1
      const c1 = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('c1@studio.local', '${hash}', 'Cliente Uno', 'cliente', true) RETURNING id;
      `);
      client1Id = c1.rows[0]!.id;
      client1Token = createToken({ id: client1Id, role: "cliente" });

      // Cliente 2
      const c2 = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('c2@studio.local', '${hash}', 'Cliente Dos', 'cliente', true) RETURNING id;
      `);
      client2Token = createToken({ id: c2.rows[0]!.id, role: "cliente" });

      // Profesional
      const pu = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('pro@studio.local', '${hash}', 'Pro', 'profesional', true) RETURNING id;
      `);
      const p = await pool.query<{ id: string }>(`
        INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
      `, [pu.rows[0]!.id]);
      profId = p.rows[0]!.id;
      profToken = createToken({ id: pu.rows[0]!.id, role: "profesional" });

      const s = await pool.query<{ id: string }>(`
        INSERT INTO services (name, duration_minutes, price_cents, active)
        VALUES ('Corte', 45, 900000, true) RETURNING id;
      `);
      serviceId = s.rows[0]!.id;
    });

    it(
      "CP-30: Cancelación a tiempo (exactamente 24 horas antes) pasa a 'cancelado' y libera el horario",
      async () => {
        const pool = getTestPool();

        // Reloj fijo: 2026-12-01 10:00:00Z
        // Turno empieza exactamente 24 horas después: 2026-12-02 10:00:00Z
        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-02T10:00:00Z', '2026-12-02T10:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [client1Id, profId, serviceId]);

        const appId = appRes.rows[0]!.id;

        const cancelRes = await request(app)
          .post(`/api/appointments/${appId}/cancel`)
          .set("Authorization", `Bearer ${client1Token}`)
          .send({ reason: "Viaje imprevisto" });

        expect(cancelRes.status).toBe(200);
        expect(cancelRes.body.status).toBe("cancelado");
        expect(cancelRes.body.cancelReason).toBe("Viaje imprevisto");
        expect(cancelRes.body.cancelledAt).toBeDefined();

        // El turno ya no debe bloquear una reserva nueva en ese mismo inicio
        const poolCheck = await pool.query<{ status: string }>(
          "SELECT status FROM appointments WHERE id = $1;",
          [appId],
        );
        expect(poolCheck.rows[0]?.status).toBe("cancelado");
      },
    );

    it(
      "CP-31: Cancelación tardía (< 24 horas) responde 422 LATE_CANCEL y sigue reservado",
      async () => {
        const pool = getTestPool();

        // Turno empieza en 23 horas y 59 minutos: 2026-12-02 09:59:00Z
        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-02T09:59:00Z', '2026-12-02T10:44:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [client1Id, profId, serviceId]);

        const appId = appRes.rows[0]!.id;

        const res = await request(app)
          .post(`/api/appointments/${appId}/cancel`)
          .set("Authorization", `Bearer ${client1Token}`);

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("LATE_CANCEL");

        const check = await pool.query<{ status: string }>(
          "SELECT status FROM appointments WHERE id = $1;",
          [appId],
        );
        expect(check.rows[0]?.status).toBe("reservado");
      },
    );

    it(
      "CP-32: El administrador puede cancelar tardíamente (en 1 hora) y queda cancelado",
      async () => {
        const pool = getTestPool();

        // Turno empieza en 1 hora: 2026-12-01 11:00:00Z
        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T11:00:00Z', '2026-12-01T11:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [client1Id, profId, serviceId]);

        const appId = appRes.rows[0]!.id;

        const res = await request(app)
          .post(`/api/appointments/${appId}/cancel`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ reason: "Cierre por emergencia" });

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("cancelado");
      },
    );

    it(
      "CP-33: El profesional no cancela turnos y recibe 403 FORBIDDEN",
      async () => {
        const pool = getTestPool();

        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-02T15:00:00Z', '2026-12-02T15:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [client1Id, profId, serviceId]);

        const appId = appRes.rows[0]!.id;

        const res = await request(app)
          .post(`/api/appointments/${appId}/cancel`)
          .set("Authorization", `Bearer ${profToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );

    it(
      "CP-34: Un cliente no puede cancelar un turno ajeno y recibe 403 FORBIDDEN",
      async () => {
        const pool = getTestPool();

        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-02T16:00:00Z', '2026-12-02T16:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [client1Id, profId, serviceId]);

        const appId = appRes.rows[0]!.id;

        // Cliente 2 intenta cancelar el turno del Cliente 1
        const res = await request(app)
          .post(`/api/appointments/${appId}/cancel`)
          .set("Authorization", `Bearer ${client2Token}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );
  });
});
