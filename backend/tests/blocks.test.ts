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

describe("T06 — Módulo de Bloqueos (CP-16, CP-17 y validaciones)", () => {
  let dbAvailable = false;
  // Reloj fijo: 2026-12-01 08:00 UTC
  const fixedClock = createFixedClock("2026-12-01T08:00:00Z");
  const app = createApp({ clock: fixedClock });

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      await setupTestDatabase();
    }
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
    let profId: string;
    let profToken: string;
    let clientToken: string;

    beforeEach(async () => {
      if (!dbAvailable) return;
      const pool = getTestPool();
      const hash = await bcrypt.hash("clave1234", 10);

      // Crear profesional
      const uRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('pro.bloqueos@studio.local', '${hash}', 'Pro Bloqueos', 'profesional', true)
        RETURNING id;
      `);
      const pRes = await pool.query<{ id: string }>(`
        INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
      `, [uRes.rows[0]!.id]);

      profId = pRes.rows[0]!.id;
      profToken = createToken({ id: uRes.rows[0]!.id, role: "profesional" });

      // Crear cliente
      const cRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('cliente.bloqueos@studio.local', '${hash}', 'Cliente Bloqueos', 'cliente', true)
        RETURNING id;
      `);
      clientToken = createToken({ id: cRes.rows[0]!.id, role: "cliente" });
    });

    it.skipIf(!dbAvailable)(
      "Crear un bloqueo con fin pasado o fin menor al inicio responde 422 INVALID_BLOCK",
      async () => {
        // Fin anterior al inicio
        const res1 = await request(app)
          .post(`/api/professionals/${profId}/blocks`)
          .set("Authorization", `Bearer ${profToken}`)
          .send({
            startAt: "2026-12-01T12:00:00Z",
            endAt: "2026-12-01T10:00:00Z", // menor
          });
        expect(res1.status).toBe(422);
        expect(res1.body.error.code).toBe("INVALID_BLOCK");

        // Fin en el pasado relativo al reloj fijo (08:00Z)
        const res2 = await request(app)
          .post(`/api/professionals/${profId}/blocks`)
          .set("Authorization", `Bearer ${profToken}`)
          .send({
            startAt: "2026-12-01T06:00:00Z",
            endAt: "2026-12-01T07:00:00Z", // pasado
          });
        expect(res2.status).toBe(422);
        expect(res2.body.error.code).toBe("INVALID_BLOCK");
      },
    );

    it.skipIf(!dbAvailable)(
      "CP-17: Un cliente no puede crear bloqueos y recibe 403 FORBIDDEN",
      async () => {
        const res = await request(app)
          .post(`/api/professionals/${profId}/blocks`)
          .set("Authorization", `Bearer ${clientToken}`)
          .send({
            startAt: "2026-12-01T14:00:00Z",
            endAt: "2026-12-01T16:00:00Z",
          });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );

    it.skipIf(!dbAvailable)(
      "CP-16: No se puede crear un bloqueo encima de un turno reservado (409 OVERLAP)",
      async () => {
        const pool = getTestPool();

        // 1. Crear servicio y cliente para el turno
        const sRes = await pool.query<{ id: string }>(`
          INSERT INTO services (name, duration_minutes, price_cents, active)
          VALUES ('Corte', 60, 100000, true) RETURNING id;
        `);
        const cRes = await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE role = 'cliente' LIMIT 1;",
        );

        // 2. Insertar turno de 10:00 a 11:00 reservado
        await pool.query(`
          INSERT INTO appointments (
            client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes
          ) VALUES (
            $1, $2, $3, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 'reservado', 100000, 60
          );
        `, [cRes.rows[0]!.id, profId, sRes.rows[0]!.id]);

        // 3. Profesional intenta crear bloqueo de 10:30 a 12:00
        const res = await request(app)
          .post(`/api/professionals/${profId}/blocks`)
          .set("Authorization", `Bearer ${profToken}`)
          .send({
            startAt: "2026-12-01T10:30:00Z",
            endAt: "2026-12-01T12:00:00Z",
            reason: "Capacitación",
          });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe("OVERLAP");
      },
    );

    it.skipIf(!dbAvailable)(
      "Borrar un bloqueo ya terminado responde 422 INVALID_BLOCK",
      async () => {
        const pool = getTestPool();
        const uRes = await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE role = 'profesional' LIMIT 1;",
        );

        // Insertar un bloqueo que terminó a las 07:30Z (antes de las 08:00Z del reloj)
        const bRes = await pool.query<{ id: string }>(`
          INSERT INTO time_blocks (professional_id, start_at, end_at, reason, created_by)
          VALUES ($1, '2026-12-01T07:00:00Z', '2026-12-01T07:30:00Z', 'Trámite', $2)
          RETURNING id;
        `, [profId, uRes.rows[0]!.id]);

        const res = await request(app)
          .delete(`/api/professionals/${profId}/blocks/${bRes.rows[0]!.id}`)
          .set("Authorization", `Bearer ${profToken}`);

        expect(res.status).toBe(422);
        expect(res.body.error.code).toBe("INVALID_BLOCK");
      },
    );
  });
});
