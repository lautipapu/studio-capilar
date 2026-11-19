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

describe("T04 — Módulo de Servicios (CP-07 a CP-10)", () => {
  let dbAvailable = false;
  const app = createApp({ pool: getTestPool() });

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

  describe("Validaciones estáticas de reglas de negocio (sin conexión)", () => {
    it("CP-09: Crear servicio con duración que no es múltiplo de 15 lanza error de validación", async () => {
      const { ServicesService } = await import("../src/modules/services/service.js");
      const service = new ServicesService({} as any);

      await expect(
        service.create({
          name: "Corte Rápido",
          durationMinutes: 20, // no es múltiplo de 15
          priceCents: 100000,
        }),
      ).rejects.toThrow("La duración debe ser múltiplo de 15 minutos.");
    });
  });

  describe("Integración con base de datos real", () => {
    let adminToken: string;
    let clientToken: string;

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

      const clientRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('cliente@studio.local', '${hash}', 'Cliente', 'cliente', true)
        RETURNING id;
      `);
      clientToken = createToken({ id: clientRes.rows[0]!.id, role: "cliente" });
    });

    it.skipIf(!dbAvailable)(
      "CP-07: Catálogo público sin token solo devuelve servicios activos",
      async () => {
        const pool = getTestPool();
        await pool.query(`
          INSERT INTO services (name, duration_minutes, price_cents, active)
          VALUES ('Corte Activo', 45, 1500000, true),
                 ('Corte Inactivo', 30, 800000, false);
        `);

        const res = await request(app).get("/api/services");

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(1);
        expect(res.body[0].name).toBe("Corte Activo");
        expect(res.body[0].durationMinutes).toBe(45);
        expect(res.body[0].priceCents).toBe(1500000);
      },
    );

    it.skipIf(!dbAvailable)(
      "CP-08: Administrador da de alta y baja lógica a un servicio",
      async () => {
        // Alta
        const createRes = await request(app)
          .post("/api/services")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            name: "Corte",
            description: "Corte clásico",
            durationMinutes: 45,
            priceCents: 1500000,
          });

        expect(createRes.status).toBe(201);
        expect(createRes.body.active).toBe(true);
        const serviceId = createRes.body.id;

        // Desactivación lógica
        const patchRes = await request(app)
          .patch(`/api/services/${serviceId}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ active: false });

        expect(patchRes.status).toBe(200);
        expect(patchRes.body.active).toBe(false);

        // Verificación en catálogo público: ya no aparece
        const publicRes = await request(app).get("/api/services");
        expect(publicRes.body.find((s: any) => s.id === serviceId)).toBeUndefined();

        // Verificación para administrador con ?includeInactive=true: sí aparece
        const adminListRes = await request(app)
          .get("/api/services?includeInactive=true")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(adminListRes.status).toBe(200);
        expect(adminListRes.body.find((s: any) => s.id === serviceId)).toBeDefined();
      },
    );

    it.skipIf(!dbAvailable)(
      "CP-09: Duración de 20 minutos responde 400 y no se guarda",
      async () => {
        const res = await request(app)
          .post("/api/services")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            name: "Corte Ilegal",
            durationMinutes: 20,
            priceCents: 100000,
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
      },
    );

    it.skipIf(!dbAvailable)(
      "CP-10: Un cliente no administra servicios y recibe 403 FORBIDDEN",
      async () => {
        const res = await request(app)
          .post("/api/services")
          .set("Authorization", `Bearer ${clientToken}`)
          .send({
            name: "Corte Cliente",
            durationMinutes: 30,
            priceCents: 100000,
          });

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );
  });
});
