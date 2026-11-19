import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSeed } from "../src/db/seed.js";
import {
  closeTestPool,
  getTestPool,
  isDatabaseAvailable,
  resetDatabase,
  setupTestDatabase,
  TEST_DATABASE_URL,
} from "./helpers.js";

describe("T13 — Semilla Idempotente (seed.ts)", () => {
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      await setupTestDatabase();
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  it("el módulo de semilla exporta la función runSeed", () => {
    expect(runSeed).toBeDefined();
    expect(typeof runSeed).toBe("function");
  });

  describe("Integración con base de datos real", () => {
    it.skipIf(!dbAvailable)(
      "ejecutar la semilla dos veces deja exactamente un administrador, un profesional de muestra y tres servicios",
      async () => {
        await resetDatabase();

        process.env.ADMIN_EMAIL = "admin.seed@studio.local";
        process.env.ADMIN_PASSWORD = "claveAdminSegura123";
        process.env.DEMO_PASSWORD = "claveDemoSegura123";

        // Primera ejecución
        await runSeed(TEST_DATABASE_URL);

        // Segunda ejecución consecutiva (debe ser idempotente)
        await runSeed(TEST_DATABASE_URL);

        const pool = getTestPool();

        // 1. Verificar administrador único
        const admins = await pool.query<{ count: string }>(
          "SELECT count(*) FROM users WHERE role = 'administrador';",
        );
        expect(Number(admins.rows[0]?.count)).toBe(1);

        // 2. Verificar profesional de muestra único (Ana Pérez)
        const profs = await pool.query<{ count: string }>(
          "SELECT count(*) FROM professionals;",
        );
        expect(Number(profs.rows[0]?.count)).toBe(1);

        // 3. Verificar los 3 servicios de muestra
        const services = await pool.query<{ count: string }>(
          "SELECT count(*) FROM services;",
        );
        expect(Number(services.rows[0]?.count)).toBe(3);
      },
    );
  });
});
