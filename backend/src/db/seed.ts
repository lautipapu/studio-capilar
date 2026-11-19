import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "./pool.js";

export const BACKEND_ENV_PATH = fileURLToPath(new URL("../../.env", import.meta.url));
dotenv.config({ path: BACKEND_ENV_PATH });

function databaseTarget(connectionString: string): {
  protocol: string;
  host: string;
  port: string;
  database: string;
} {
  const url = new URL(connectionString);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL_TEST debe contener una URL de PostgreSQL válida.");
  }
  return {
    protocol: "postgresql:",
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
  };
}

export function resolveTestSeedUrl(env: NodeJS.ProcessEnv = process.env): string {
  const testUrl = env.DATABASE_URL_TEST?.trim();
  if (!testUrl) {
    throw new Error("seed:test requiere que DATABASE_URL_TEST esté definida.");
  }

  let testTarget: ReturnType<typeof databaseTarget>;
  try {
    testTarget = databaseTarget(testUrl);
  } catch {
    throw new Error("DATABASE_URL_TEST debe contener una URL de PostgreSQL válida.");
  }

  const primaryUrl = env.DATABASE_URL?.trim();
  if (primaryUrl) {
    let primaryTarget: ReturnType<typeof databaseTarget>;
    try {
      primaryTarget = databaseTarget(primaryUrl);
    } catch {
      throw new Error("No se pudo verificar que DATABASE_URL_TEST sea distinta de DATABASE_URL.");
    }

    const sameTarget =
      testTarget.protocol === primaryTarget.protocol &&
      testTarget.host === primaryTarget.host &&
      testTarget.port === primaryTarget.port &&
      testTarget.database === primaryTarget.database;
    if (sameTarget) {
      throw new Error("seed:test se detuvo porque DATABASE_URL_TEST coincide con DATABASE_URL.");
    }
  }

  return testUrl;
}

export async function runSeed(
  connectionString?: string,
): Promise<{ adminCreated: boolean; demoCreated: boolean }> {
  const pool = createPool(connectionString);
  const client = await pool.connect();

  let adminCreated = false;
  let demoCreated = false;

  try {
    await client.query("BEGIN;");

    // 1. Crear o verificar Administrador único
    const adminEmail = (
      process.env.ADMIN_EMAIL?.trim() || "admin@studio-capilar.local"
    ).toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD?.trim();
    const adminName = process.env.ADMIN_NAME?.trim() || "Administrador";

    if (!adminPassword) {
      console.warn(
        "ADMIN_PASSWORD no está definida en el entorno. Se omite la creación del administrador si no existe.",
      );
    } else {
      const existingAdmin = await client.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1;",
        [adminEmail],
      );

      if (existingAdmin.rows.length === 0) {
        const hash = await bcrypt.hash(adminPassword, 10);
        await client.query(
          `INSERT INTO users (email, password_hash, name, role, active)
           VALUES ($1, $2, $3, 'administrador', true);`,
          [adminEmail, hash, adminName],
        );
        adminCreated = true;
        console.log(`Administrador creado: ${adminEmail}`);
      } else {
        console.log(`El administrador ${adminEmail} ya existe. No se modifica.`);
      }
    }

    // 2. Datos de Demostración (solo si DEMO_PASSWORD está definido)
    const demoPassword = process.env.DEMO_PASSWORD?.trim();
    if (demoPassword) {
      demoCreated = true;

      // 2.1 Profesional Ana Pérez
      const anaEmail = "ana@studio-capilar.local";
      const existingAna = await client.query(
        "SELECT id FROM users WHERE email = $1 LIMIT 1;",
        [anaEmail],
      );

      let anaProfId: string;
      if (existingAna.rows.length === 0) {
        const anaHash = await bcrypt.hash(demoPassword, 10);
        const anaUserRes = await client.query<{ id: string }>(
          `INSERT INTO users (email, password_hash, name, role, active)
           VALUES ($1, $2, 'Ana Pérez', 'profesional', true)
           RETURNING id;`,
          [anaEmail, anaHash],
        );
        const anaUserId = anaUserRes.rows[0]!.id;

        const profRes = await client.query<{ id: string }>(
          `INSERT INTO professionals (user_id, bio, active)
           VALUES ($1, 'Especialista en cortes y coloración.', true)
           RETURNING id;`,
          [anaUserId],
        );
        anaProfId = profRes.rows[0]!.id;

        // Horario de Ana: Lunes a viernes 09:00 a 18:00, Sábado 09:00 a 13:00
        for (let weekday = 1; weekday <= 5; weekday++) {
          await client.query(
            `INSERT INTO professional_schedules (professional_id, weekday, start_time, end_time)
             VALUES ($1, $2, '09:00', '18:00');`,
            [anaProfId, weekday],
          );
        }
        await client.query(
          `INSERT INTO professional_schedules (professional_id, weekday, start_time, end_time)
           VALUES ($1, 6, '09:00', '13:00');`,
          [anaProfId],
        );
        console.log(`Profesional de muestra creada: ${anaEmail}`);
      }

      // 2.2 Servicios de muestra (Corte clásico, Brushing, Coloración)
      const demoServices = [
        {
          name: "Corte clásico",
          description: "Corte y lavado tradicional.",
          durationMinutes: 45,
          priceCents: 1500000,
        },
        {
          name: "Brushing",
          description: "Secado y peinado profesional.",
          durationMinutes: 30,
          priceCents: 800000,
        },
        {
          name: "Coloración",
          description: "Tintura completa y nutrición capilar.",
          durationMinutes: 120,
          priceCents: 4500000,
        },
      ];

      for (const s of demoServices) {
        const existingSvc = await client.query(
          "SELECT id FROM services WHERE name = $1 LIMIT 1;",
          [s.name],
        );
        if (existingSvc.rows.length === 0) {
          await client.query(
            `INSERT INTO services (name, description, duration_minutes, price_cents, active)
             VALUES ($1, $2, $3, $4, true);`,
            [s.name, s.description, s.durationMinutes, s.priceCents],
          );
          console.log(`Servicio de muestra creado: ${s.name}`);
        }
      }
    }

    await client.query("COMMIT;");
    return { adminCreated, demoCreated };
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error("Error ejecutando semilla:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecución directa CLI; la bandera --test es el único modo que usa DATABASE_URL_TEST.
const isDirectCall =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCall) {
  const testMode = process.argv.includes("--test");
  const connectionString = testMode ? resolveTestSeedUrl() : undefined;

  runSeed(connectionString)
    .then(() => {
      console.log("Semilla completada exitosamente.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fallo la ejecución de la semilla:", err);
      process.exit(1);
    });
}
