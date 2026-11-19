import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createToken } from "../src/middleware/auth.js";
import {
  closeTestPool,
  getTestPool,
  isDatabaseAvailable,
  resetDatabase,
  setupTestDatabase,
} from "./helpers.js";

describe("T09 — Consulta de Turnos según Rol (CP-29)", () => {
  let dbAvailable = false;
  const app = createApp({ pool: getTestPool() });

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

  describe("Seguridad sin conexión", () => {
    it("Listar turnos sin token responde 401 UNAUTHORIZED", async () => {
      const res = await request(app).get("/api/appointments");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("Integración con base de datos real", () => {
    it(
      "CP-29: Cada rol ve únicamente los turnos que le corresponden",
      async () => {
        const pool = getTestPool();
        const hash = await bcrypt.hash("clave1234", 10);

        // 1. Crear Admin
        const aRes = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role, active)
          VALUES ('admin@studio.local', '${hash}', 'Admin', 'administrador', true) RETURNING id;
        `);
        const adminToken = createToken({
          id: aRes.rows[0]!.id,
          role: "administrador",
        });

        // 2. Crear Cliente A y Cliente B
        const caRes = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role, active)
          VALUES ('ca@studio.local', '${hash}', 'Cliente A', 'cliente', true) RETURNING id;
        `);
        const cbRes = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role, active)
          VALUES ('cb@studio.local', '${hash}', 'Cliente B', 'cliente', true) RETURNING id;
        `);
        const clientAToken = createToken({
          id: caRes.rows[0]!.id,
          role: "cliente",
        });
        const clientBToken = createToken({
          id: cbRes.rows[0]!.id,
          role: "cliente",
        });

        // 3. Crear Profesional P1 y Profesional P2
        const p1u = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role, active)
          VALUES ('p1@studio.local', '${hash}', 'Pro 1', 'profesional', true) RETURNING id;
        `);
        const p1 = await pool.query<{ id: string }>(`
          INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
        `, [p1u.rows[0]!.id]);

        const p2u = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role, active)
          VALUES ('p2@studio.local', '${hash}', 'Pro 2', 'profesional', true) RETURNING id;
        `);
        const p2 = await pool.query<{ id: string }>(`
          INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
        `, [p2u.rows[0]!.id]);

        const prof1Token = createToken({
          id: p1u.rows[0]!.id,
          role: "profesional",
        });

        // 4. Crear Servicio
        const sRes = await pool.query<{ id: string }>(`
          INSERT INTO services (name, duration_minutes, price_cents, active)
          VALUES ('Servicio 1', 30, 50000, true) RETURNING id;
        `);
        const sId = sRes.rows[0]!.id;

        // 5. Insertar turnos:
        // Turno 1: Cliente A con Profesional P1
        await pool.query(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T14:00:00Z', '2026-12-01T14:30:00Z', 'reservado', 50000, 30);
        `, [caRes.rows[0]!.id, p1.rows[0]!.id, sId]);

        // Turno 2: Cliente B con Profesional P1
        await pool.query(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T15:00:00Z', '2026-12-01T15:30:00Z', 'reservado', 50000, 30);
        `, [cbRes.rows[0]!.id, p1.rows[0]!.id, sId]);

        // Turno 3: Cliente A con Profesional P2
        await pool.query(`
          INSERT INTO appointments (client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes)
          VALUES ($1, $2, $3, '2026-12-01T16:00:00Z', '2026-12-01T16:30:00Z', 'reservado', 50000, 30);
        `, [caRes.rows[0]!.id, p2.rows[0]!.id, sId]);

        // Consulta de Cliente A: debe ver solo sus dos turnos (con P1 y con P2)
        const resA = await request(app)
          .get("/api/appointments")
          .set("Authorization", `Bearer ${clientAToken}`);
        expect(resA.status).toBe(200);
        expect(resA.body.length).toBe(2);
        expect(resA.body.every((a: any) => a.clientId === caRes.rows[0]!.id)).toBe(
          true,
        );

        // Consulta de Profesional P1: debe ver los turnos de A y B con P1, y NUNCA el de P2
        const resP1 = await request(app)
          .get("/api/appointments")
          .set("Authorization", `Bearer ${prof1Token}`);
        expect(resP1.status).toBe(200);
        expect(resP1.body.length).toBe(2);
        expect(
          resP1.body.every((a: any) => a.professionalId === p1.rows[0]!.id),
        ).toBe(true);

        // Consulta de Administrador: debe ver los 3 turnos
        const resAdmin = await request(app)
          .get("/api/appointments")
          .set("Authorization", `Bearer ${adminToken}`);
        expect(resAdmin.status).toBe(200);
        expect(resAdmin.body.length).toBe(3);
      },
    );
  });
});
