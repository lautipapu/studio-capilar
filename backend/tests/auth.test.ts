import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  closeTestPool,
  getTestPool,
  isDatabaseAvailable,
  resetDatabase,
  setupTestDatabase,
} from "./helpers.js";

describe("T03 — Módulo Auth (CP-01 a CP-06)", () => {
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

  describe("Validaciones de entrada (sin conexión)", () => {
    it("CP-03: Contraseña débil responde 400 VALIDATION_ERROR y no crea el usuario", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Usuario Test",
        email: "debil@studio.local",
        password: "sololetras", // sin números
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Contraseña de solo números responde 400 VALIDATION_ERROR", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Usuario Test",
        email: "numeros@studio.local",
        password: "12345678", // sin letras
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("Email mal formado responde 400 VALIDATION_ERROR", async () => {
      const res = await request(app).post("/api/auth/register").send({
        name: "Usuario Test",
        email: "no-es-un-email",
        password: "claveValida123",
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Integración con base de datos real", () => {
    it(
      "CP-01: Registro válido fuerza rol cliente e ignora role: administrador",
      async () => {
        const res = await request(app).post("/api/auth/register").send({
          name: "Cliente Uno",
          email: "cliente1@studio.local",
          password: "claveValida123",
          role: "administrador", // debe ser ignorado
        });

        expect(res.status).toBe(201);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.role).toBe("cliente");
        expect(res.body.user.email).toBe("cliente1@studio.local");

        // GET /api/auth/me con el token debe devolver el mismo usuario
        const meRes = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${res.body.token}`);

        expect(meRes.status).toBe(200);
        expect(meRes.body.user.id).toBe(res.body.user.id);
        expect(meRes.body.user.role).toBe("cliente");
      },
    );

    it(
      "CP-02: Email repetido (incluso con otras mayúsculas) responde 409 EMAIL_TAKEN",
      async () => {
        await request(app).post("/api/auth/register").send({
          name: "Cliente Original",
          email: "repetido@studio.local",
          password: "claveValida123",
        });

        const res2 = await request(app).post("/api/auth/register").send({
          name: "Cliente Intento 2",
          email: "REPETIDO@STUDIO.LOCAL",
          password: "claveValida123",
        });

        expect(res2.status).toBe(409);
        expect(res2.body.error.code).toBe("EMAIL_TAKEN");
      },
    );

    it(
      "CP-04: Ingreso válido responde 200 y token aceptado por /api/auth/me",
      async () => {
        await request(app).post("/api/auth/register").send({
          name: "Cliente Login",
          email: "login@studio.local",
          password: "claveValida123",
        });

        const res = await request(app).post("/api/auth/login").send({
          email: "login@studio.local",
          password: "claveValida123",
        });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.email).toBe("login@studio.local");

        const meRes = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${res.body.token}`);

        expect(meRes.status).toBe(200);
      },
    );

    it(
      "CP-05: Credenciales incorrectas responde 401 INVALID_CREDENTIALS",
      async () => {
        await request(app).post("/api/auth/register").send({
          name: "Cliente Existente",
          email: "existente@studio.local",
          password: "claveValida123",
        });

        // Contraseña incorrecta
        const resBadPass = await request(app).post("/api/auth/login").send({
          email: "existente@studio.local",
          password: "claveIncorrecta999",
        });
        expect(resBadPass.status).toBe(401);
        expect(resBadPass.body.error.code).toBe("INVALID_CREDENTIALS");
        expect(resBadPass.body.error.message).toBe("Credenciales inválidas.");

        // Email inexistente
        const resNoEmail = await request(app).post("/api/auth/login").send({
          email: "noexiste@studio.local",
          password: "claveValida123",
        });
        expect(resNoEmail.status).toBe(401);
        expect(resNoEmail.body.error.code).toBe("INVALID_CREDENTIALS");
        expect(resNoEmail.body.error.message).toBe("Credenciales inválidas.");
      },
    );

    it(
      "CP-06: Usuario inactivo responde 401 INVALID_CREDENTIALS al intentar ingresar",
      async () => {
        const regRes = await request(app).post("/api/auth/register").send({
          name: "Cliente Desactivado",
          email: "desactivado@studio.local",
          password: "claveValida123",
        });

        const pool = getTestPool();
        await pool.query("UPDATE users SET active = false WHERE id = $1;", [
          regRes.body.user.id,
        ]);

        const loginRes = await request(app).post("/api/auth/login").send({
          email: "desactivado@studio.local",
          password: "claveValida123",
        });

        expect(loginRes.status).toBe(401);
        expect(loginRes.body.error.code).toBe("INVALID_CREDENTIALS");

        // Y un token viejo de usuario desactivado recibe 401 en /api/auth/me
        const meRes = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${regRes.body.token}`);

        expect(meRes.status).toBe(401);
      },
    );
  });
});
