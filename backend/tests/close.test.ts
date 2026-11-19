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

describe("T11 — Cierre de Turnos: Completar y Ausente (CP-35 a CP-39)", () => {
  let dbAvailable = false;
  // Reloj fijo: 2026-12-01 15:00:00 UTC
  const fixedClock = createFixedClock("2026-12-01T15:00:00Z");
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
    let prof1Token: string;
    let prof1Id: string;
    let prof2Token: string;
    let prof2Id: string;
    let clientId: string;
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

      // Cliente
      const c = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('cliente@studio.local', '${hash}', 'Cliente', 'cliente', true) RETURNING id;
      `);
      clientId = c.rows[0]!.id;

      // Profesional 1
      const p1u = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('pro1@studio.local', '${hash}', 'Pro 1', 'profesional', true) RETURNING id;
      `);
      const p1 = await pool.query<{ id: string }>(`
        INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
      `, [p1u.rows[0]!.id]);
      prof1Id = p1.rows[0]!.id;
      prof1Token = createToken({ id: p1u.rows[0]!.id, role: "profesional" });

      // Profesional 2
      const p2u = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('pro2@studio.local', '${hash}', 'Pro 2', 'profesional', true) RETURNING id;
      `);
      const p2 = await pool.query<{ id: string }>(`
        INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
      `, [p2u.rows[0]!.id]);
      prof2Id = p2.rows[0]!.id;
      prof2Token = createToken({ id: p2u.rows[0]!.id, role: "profesional" });

      const s = await pool.query<{ id: string }>(`
        INSERT INTO services (name, duration_minutes, price_cents, active)
        VALUES ('Corte', 45, 900000, true) RETURNING id;
      `);
      serviceId = s.rows[0]!.id;
    });

    it(
      "CP-35: Completar desde el inicio (startAt <= reloj) pasa a completado",
      async () => {
        const pool = getTestPool();

        // Turno cuyo inicio es exactamente igual al reloj de la prueba (15:00Z)
        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T15:00:00Z', '2026-12-01T15:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [clientId, prof1Id, serviceId]);

        const appId = appRes.rows[0]!.id;

        const res = await request(app)
          .post(`/api/appointments/${appId}/complete`)
          .set("Authorization", `Bearer ${prof1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("completado");
      },
    );

    it(
      "CP-36: Cerrar antes de tiempo (startAt futuro) responde 422 INVALID_TRANSITION y sigue reservado",
      async () => {
        const pool = getTestPool();

        // Turno empieza a las 16:00Z (reloj en 15:00Z)
        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T16:00:00Z', '2026-12-01T16:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [clientId, prof1Id, serviceId]);

        const appId = appRes.rows[0]!.id;

        // Intentar completar
        const resComplete = await request(app)
          .post(`/api/appointments/${appId}/complete`)
          .set("Authorization", `Bearer ${prof1Token}`);

        expect(resComplete.status).toBe(422);
        expect(resComplete.body.error.code).toBe("INVALID_TRANSITION");

        // Intentar ausente
        const resNoShow = await request(app)
          .post(`/api/appointments/${appId}/no-show`)
          .set("Authorization", `Bearer ${prof1Token}`);

        expect(resNoShow.status).toBe(422);
        expect(resNoShow.body.error.code).toBe("INVALID_TRANSITION");

        // Sigue reservado
        const check = await pool.query<{ status: string }>(
          "SELECT status FROM appointments WHERE id = $1;",
          [appId],
        );
        expect(check.rows[0]?.status).toBe("reservado");
      },
    );

    it(
      "CP-37: Ausente (no-show) en turno ya iniciado pasa a ausente",
      async () => {
        const pool = getTestPool();

        // Turno empezó a las 14:00Z (reloj en 15:00Z)
        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T14:00:00Z', '2026-12-01T14:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [clientId, prof1Id, serviceId]);

        const appId = appRes.rows[0]!.id;

        const res = await request(app)
          .post(`/api/appointments/${appId}/no-show`)
          .set("Authorization", `Bearer ${prof1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ausente");
      },
    );

    it(
      "CP-38: Los estados finales no permiten transiciones (turno cancelado no se completa)",
      async () => {
        const pool = getTestPool();

        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T14:00:00Z', '2026-12-01T14:45:00Z', 'cancelado', 900000, 45)
          RETURNING id;
        `, [clientId, prof1Id, serviceId]);

        const appId = appRes.rows[0]!.id;

        const res = await request(app)
          .post(`/api/appointments/${appId}/complete`)
          .set("Authorization", `Bearer ${adminToken}`);

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("INVALID_TRANSITION");
      },
    );

    it(
      "CP-39: Un profesional ajeno no puede cerrar el turno (403 FORBIDDEN)",
      async () => {
        const pool = getTestPool();

        const appRes = await pool.query<{ id: string }>(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T14:00:00Z', '2026-12-01T14:45:00Z', 'reservado', 900000, 45)
          RETURNING id;
        `, [clientId, prof1Id, serviceId]);

        const appId = appRes.rows[0]!.id;

        // Profesional 2 intenta cerrar turno de Profesional 1
        const res = await request(app)
          .post(`/api/appointments/${appId}/complete`)
          .set("Authorization", `Bearer ${prof2Token}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );
  });
});
