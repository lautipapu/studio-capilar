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

describe("T05 — Módulo de Profesionales y Horario Semanal (CP-11 a CP-13)", () => {
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

  describe("Integración con base de datos real", () => {
    let adminToken: string;

    beforeEach(async () => {
      if (!dbAvailable) return;
      const pool = getTestPool();
      const hash = await bcrypt.hash("clave1234", 10);

      const adminRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('admin@studio.local', '${hash}', 'Admin', 'administrador', true)
        RETURNING id;
      `);
      adminToken = createToken({ id: adminRes.rows[0]!.id, role: "administrador" });
    });

    it(
      "CP-11: Alta con horario inicial de lunes a sábado y domingo cerrado",
      async () => {
        const createRes = await request(app)
          .post("/api/professionals")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            name: "Ana Pérez",
            email: "ana@studio.local",
            password: "claveValida123",
            bio: "Especialista en peinados",
          });

        expect(createRes.status).toBe(201);
        const profId = createRes.body.id;

        // Comprobar ficha y horario semanal
        const getRes = await request(app).get(`/api/professionals/${profId}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.name).toBe("Ana Pérez");
        expect(getRes.body.schedule.length).toBe(6); // Lunes a Sábado

        const monday = getRes.body.schedule.find((s: any) => s.weekday === 1);
        expect(monday.startTime).toBe("09:00");
        expect(monday.endTime).toBe("18:00");

        const saturday = getRes.body.schedule.find((s: any) => s.weekday === 6);
        expect(saturday.startTime).toBe("09:00");
        expect(saturday.endTime).toBe("13:00");

        const sunday = getRes.body.schedule.find((s: any) => s.weekday === 7);
        expect(sunday).toBeUndefined(); // domingo cerrado
      },
    );

    it(
      "CP-12: Desactivar profesional impide ingreso y lo oculta del público",
      async () => {
        const createRes = await request(app)
          .post("/api/professionals")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            name: "Carlos Gómez",
            email: "carlos@studio.local",
            password: "claveValida123",
          });

        const profId = createRes.body.id;

        // Desactivar profesional
        const patchRes = await request(app)
          .patch(`/api/professionals/${profId}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ active: false });

        expect(patchRes.status).toBe(200);
        expect(patchRes.body.active).toBe(false);

        // Login debe fallar
        const loginRes = await request(app).post("/api/auth/login").send({
          email: "carlos@studio.local",
          password: "claveValida123",
        });
        expect(loginRes.status).toBe(401);

        // Desaparece del listado público
        const publicList = await request(app).get("/api/professionals");
        expect(publicList.body.find((p: any) => p.id === profId)).toBeUndefined();

        // Consulta directa pública responde 404
        const publicGet = await request(app).get(`/api/professionals/${profId}`);
        expect(publicGet.status).toBe(404);
      },
    );

    it(
      "CP-13 (persistencia): Reemplazo de horario deja únicamente el martes 10:00-14:00",
      async () => {
        const createRes = await request(app)
          .post("/api/professionals")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            name: "Beatriz López",
            email: "beatriz@studio.local",
            password: "claveValida123",
          });

        const profId = createRes.body.id;

        // Reemplazar horario completo
        const putRes = await request(app)
          .put(`/api/professionals/${profId}/schedule`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            days: [{ weekday: 2, startTime: "10:00", endTime: "14:00" }],
          });

        expect(putRes.status).toBe(200);
        expect(putRes.body.days.length).toBe(1);
        expect(putRes.body.days[0].weekday).toBe(2);

        // GET del profesional devuelve solo martes 10:00-14:00
        const getRes = await request(app).get(`/api/professionals/${profId}`);
        expect(getRes.status).toBe(200);
        expect(getRes.body.schedule.length).toBe(1);
        expect(getRes.body.schedule[0].weekday).toBe(2);
        expect(getRes.body.schedule[0].startTime).toBe("10:00");
        expect(getRes.body.schedule[0].endTime).toBe("14:00");
      },
    );

    it(
      "Un profesional no puede reemplazar el horario de otro profesional (403 FORBIDDEN)",
      async () => {
        const pool = getTestPool();
        const hash = await bcrypt.hash("clave1234", 10);

        // Profesional 1
        const u1 = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role, active)
          VALUES ('pro1@studio.local', '${hash}', 'Pro 1', 'profesional', true) RETURNING id;
        `);
        const p1 = await pool.query<{ id: string }>(`
          INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
        `, [u1.rows[0]!.id]);

        // Profesional 2
        const u2 = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role, active)
          VALUES ('pro2@studio.local', '${hash}', 'Pro 2', 'profesional', true) RETURNING id;
        `);
        const p2 = await pool.query<{ id: string }>(`
          INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
        `, [u2.rows[0]!.id]);

        const pro1Token = createToken({
          id: u1.rows[0]!.id,
          role: "profesional",
        });

        // Pro 1 intenta modificar el horario de Pro 2
        const res = await request(app)
          .put(`/api/professionals/${p2.rows[0]!.id}/schedule`)
          .set("Authorization", `Bearer ${pro1Token}`)
          .send({
            days: [{ weekday: 1, startTime: "10:00", endTime: "12:00" }],
          });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );
  });
});
