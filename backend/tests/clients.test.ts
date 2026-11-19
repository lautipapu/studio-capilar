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

describe("T12 — Administración de Clientes (CP-40, CP-41)", () => {
  let dbAvailable = false;
  const app = createApp();

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
    let adminToken: string;
    let clientToken: string;
    let client1Id: string;
    let client2Id: string;

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
        VALUES ('cliente1@studio.local', '${hash}', 'Cliente Uno', 'cliente', true) RETURNING id;
      `);
      client1Id = c1.rows[0]!.id;
      clientToken = createToken({ id: client1Id, role: "cliente" });

      // Cliente 2
      const c2 = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('cliente2@studio.local', '${hash}', 'Cliente Dos', 'cliente', true) RETURNING id;
      `);
      client2Id = c2.rows[0]!.id;
    });

    it.skipIf(!dbAvailable)(
      "CP-40: Listado y baja lógica de cliente impide que figure activo y bloquea su login",
      async () => {
        // 1. Listar activos: deben aparecer ambos clientes
        const listBefore = await request(app)
          .get("/api/clients")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(listBefore.status).toBe(200);
        expect(listBefore.body.length).toBe(2);

        // 2. Desactivar Cliente 2
        const patchRes = await request(app)
          .patch(`/api/clients/${client2Id}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ active: false });

        expect(patchRes.status).toBe(200);
        expect(patchRes.body.active).toBe(false);

        // 3. Listar activos de nuevo: solo debe figurar Cliente 1
        const listAfter = await request(app)
          .get("/api/clients")
          .set("Authorization", `Bearer ${adminToken}`);

        expect(listAfter.status).toBe(200);
        expect(listAfter.body.length).toBe(1);
        expect(listAfter.body[0].id).toBe(client1Id);

        // 4. Intentar login con Cliente 2 desactivado: 401 INVALID_CREDENTIALS
        const loginRes = await request(app).post("/api/auth/login").send({
          email: "cliente2@studio.local",
          password: "claveValida123",
        });

        expect(loginRes.status).toBe(401);
      },
    );

    it.skipIf(!dbAvailable)(
      "CP-41: Un cliente no puede listar clientes y recibe 403 FORBIDDEN",
      async () => {
        const res = await request(app)
          .get("/api/clients")
          .set("Authorization", `Bearer ${clientToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      },
    );

    it.skipIf(!dbAvailable)(
      "PATCH sobre un ID que no es cliente responde 404 NOT_FOUND",
      async () => {
        const pool = getTestPool();
        const aIdRes = await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE role = 'administrador' LIMIT 1;",
        );

        const res = await request(app)
          .patch(`/api/clients/${aIdRes.rows[0]!.id}`)
          .set("Authorization", `Bearer ${adminToken}`)
          .send({ active: false });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe("NOT_FOUND");
      },
    );
  });
});
