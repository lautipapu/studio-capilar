import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "./pool.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultMigrationsDir = path.resolve(__dirname, "../../migrations");

export async function runMigrations(
  connectionString?: string,
  migrationsDir: string = defaultMigrationsDir,
): Promise<{ applied: string[] }> {
  const pool = createPool(connectionString);
  let client;
  try {
    client = await pool.connect();
  } catch (err: any) {
    await pool.end();
    throw new Error(
      `No se pudo conectar a PostgreSQL (${err.message || err}). Verifique que la base de datos esté activa y la variable DATABASE_URL sea correcta.`,
    );
  }
  const applied: string[] = [];

  try {
    // 1. Asegurar tabla de control de migraciones
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // 2. Obtener migraciones ya aplicadas
    const res = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY filename ASC;",
    );
    const appliedSet = new Set(res.rows.map((r) => r.filename));

    // 3. Leer archivos .sql del directorio de migraciones
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter((f) => f.endsWith(".sql")).sort();

    // 4. Aplicar migraciones pendientes en orden
    for (const file of sqlFiles) {
      if (appliedSet.has(file)) {
        continue;
      }

      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, "utf-8");

      await client.query("BEGIN;");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1);",
          [file],
        );
        await client.query("COMMIT;");
        applied.push(file);
        console.log(`Migración aplicada: ${file}`);
      } catch (err) {
        await client.query("ROLLBACK;");
        console.error(`Error aplicando migración ${file}:`, err);
        throw err;
      }
    }

    if (applied.length === 0) {
      console.log("No hay migraciones pendientes.");
    }

    return { applied };
  } finally {
    client.release();
    await pool.end();
  }
}

// Ejecución directa por CLI
const isDirectCall =
  process.argv[1] &&
  (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"));

if (isDirectCall) {
  runMigrations()
    .then(({ applied }) => {
      console.log(`Proceso de migración finalizado. Aplicadas: ${applied.length}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Fallo la ejecución de migraciones:", err);
      process.exit(1);
    });
}
