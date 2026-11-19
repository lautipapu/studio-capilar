import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/db/migrate.js";
import {
  closeTestPool,
  getTestPool,
  isDatabaseAvailable,
  resetDatabase,
  TEST_DATABASE_URL,
} from "./helpers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationFile = path.resolve(__dirname, "../migrations/001_init.sql");

describe("T02 — Esquema y migraciones de PostgreSQL", () => {
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) {
      console.warn(
        "\n[AVISO T02] Base de datos PostgreSQL de pruebas no disponible. " +
          "Docker no está instalado en este entorno local. " +
          "Las pruebas de integración con PostgreSQL real se omiten y quedan listas para cuando se configure Neon/Postgres.\n",
      );
    }
  });

  afterAll(async () => {
    await closeTestPool();
  });

  describe("Verificaciones estructurales y de especificación (sin conexión requerida)", () => {
    it("el archivo 001_init.sql existe y es legible", async () => {
      const content = await fs.readFile(migrationFile, "utf-8");
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(100);
    });

    it("define las extensiones necesarias citext y btree_gist", async () => {
      const content = await fs.readFile(migrationFile, "utf-8");
      expect(content).toContain("CREATE EXTENSION IF NOT EXISTS citext;");
      expect(content).toContain("CREATE EXTENSION IF NOT EXISTS btree_gist;");
    });

    it("define los tipos enum requeridos por spec.md", async () => {
      const content = await fs.readFile(migrationFile, "utf-8");
      expect(content).toContain("'cliente', 'profesional', 'administrador'");
      expect(content).toContain(
        "'reservado', 'cancelado', 'completado', 'ausente'",
      );
    });

    it("define las tablas del modelo con sus claves foráneas e integridad", async () => {
      const content = await fs.readFile(migrationFile, "utf-8");
      expect(content).toContain("CREATE TABLE IF NOT EXISTS users");
      expect(content).toContain("CREATE TABLE IF NOT EXISTS services");
      expect(content).toContain("CREATE TABLE IF NOT EXISTS professionals");
      expect(content).toContain("CREATE TABLE IF NOT EXISTS professional_schedules");
      expect(content).toContain("CREATE TABLE IF NOT EXISTS time_blocks");
      expect(content).toContain("CREATE TABLE IF NOT EXISTS appointments");
    });

    it("define la restricción de exclusión GiST appointments_no_overlap solo para turnos reservados", async () => {
      const content = await fs.readFile(migrationFile, "utf-8");
      expect(content).toContain("appointments_no_overlap");
      expect(content).toContain("EXCLUDE USING gist");
      expect(content).toContain("WHERE (status = 'reservado')");
    });
  });

  describe("Pruebas de integración con base de datos real (cuando existe PostgreSQL)", () => {
    it.skipIf(!dbAvailable)(
      "correr migraciones dos veces no duplica objetos ni falla (idempotencia)",
      async () => {
        // Primera ejecución
        await runMigrations(TEST_DATABASE_URL);
        // Segunda ejecución consecutiva
        const secondRun = await runMigrations(TEST_DATABASE_URL);
        expect(secondRun.applied).toEqual([]);
      },
    );

    it.skipIf(!dbAvailable)(
      "la restricción GiST rechaza dos turnos reservados solapados con error 23P01",
      async () => {
        await resetDatabase();
        const pool = getTestPool();

        // 1. Crear usuario cliente
        const clientRes = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role)
          VALUES ('cliente.test@studio.local', 'hash', 'Cliente Test', 'cliente')
          RETURNING id;
        `);
        const clientId = clientRes.rows[0]?.id;

        // 2. Crear usuario profesional y ficha
        const profUserRes = await pool.query<{ id: string }>(`
          INSERT INTO users (email, password_hash, name, role)
          VALUES ('pro.test@studio.local', 'hash', 'Profesional Test', 'profesional')
          RETURNING id;
        `);
        const profUserId = profUserRes.rows[0]?.id;

        const profRes = await pool.query<{ id: string }>(`
          INSERT INTO professionals (user_id, bio)
          VALUES ($1, 'Bio')
          RETURNING id;
        `, [profUserId]);
        const professionalId = profRes.rows[0]?.id;

        // 3. Crear servicio
        const serviceRes = await pool.query<{ id: string }>(`
          INSERT INTO services (name, duration_minutes, price_cents)
          VALUES ('Corte Test', 60, 100000)
          RETURNING id;
        `);
        const serviceId = serviceRes.rows[0]?.id;

        // 4. Insertar primer turno de 10:00 a 11:00 (reservado)
        await pool.query(`
          INSERT INTO appointments (
            client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes
          ) VALUES (
            $1, $2, $3, '2026-12-01T10:00:00Z', '2026-12-01T11:00:00Z', 'reservado', 100000, 60
          );
        `, [clientId, professionalId, serviceId]);

        // 5. Intentar insertar segundo turno solapado de 10:30 a 11:30 para el mismo profesional
        let error: any = null;
        try {
          await pool.query(`
            INSERT INTO appointments (
              client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes
            ) VALUES (
              $1, $2, $3, '2026-12-01T10:30:00Z', '2026-12-01T11:30:00Z', 'reservado', 100000, 60
            );
          `, [clientId, professionalId, serviceId]);
        } catch (err) {
          error = err;
        }

        expect(error).not.toBeNull();
        expect(error.code).toBe("23P01"); // exclusion_violation
      },
    );

    it.skipIf(!dbAvailable)(
      "dos turnos que solo se tocan en el extremo se insertan exitosamente",
      async () => {
        const pool = getTestPool();

        const profRes = await pool.query<{ id: string }>(
          "SELECT id FROM professionals LIMIT 1;",
        );
        const clientRes = await pool.query<{ id: string }>(
          "SELECT id FROM users WHERE role = 'cliente' LIMIT 1;",
        );
        const serviceRes = await pool.query<{ id: string }>(
          "SELECT id FROM services LIMIT 1;",
        );

        const professionalId = profRes.rows[0]?.id;
        const clientId = clientRes.rows[0]?.id;
        const serviceId = serviceRes.rows[0]?.id;

        // Turno adyacente: empieza a las 11:00 exactas, justo cuando termina el anterior
        const result = await pool.query(`
          INSERT INTO appointments (
            client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes
          ) VALUES (
            $1, $2, $3, '2026-12-01T11:00:00Z', '2026-12-01T12:00:00Z', 'reservado', 100000, 60
          ) RETURNING id;
        `, [clientId, professionalId, serviceId]);

        expect(result.rows[0]?.id).toBeDefined();

        // Verificar que hay exactamente 2 turnos guardados
        const countRes = await pool.query<{ count: string }>(
          "SELECT count(*) FROM appointments WHERE status = 'reservado';",
        );
        expect(Number(countRes.rows[0]?.count)).toBe(2);
      },
    );
  });
});
