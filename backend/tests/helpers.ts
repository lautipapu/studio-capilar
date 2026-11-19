import "dotenv/config";
import pg from "pg";
import { createApp } from "../src/app.js";
import { runMigrations } from "../src/db/migrate.js";

const { Pool } = pg;

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  "postgresql://studio:studio@localhost:5432/studio_capilar_test";

let testPoolInstance: pg.Pool | null = null;

export function getTestPool(): pg.Pool {
  if (!testPoolInstance) {
    const isSslNeeded =
      TEST_DATABASE_URL.includes("sslmode=require") ||
      TEST_DATABASE_URL.includes("neon.tech");

    testPoolInstance = new Pool({
      connectionString: TEST_DATABASE_URL,
      connectionTimeoutMillis: 2000,
      ssl: isSslNeeded ? { rejectUnauthorized: false } : undefined,
    });
  }
  return testPoolInstance;
}

export async function closeTestPool(): Promise<void> {
  if (testPoolInstance) {
    await testPoolInstance.end();
    testPoolInstance = null;
  }
}

export async function isDatabaseAvailable(): Promise<boolean> {
  const pool = getTestPool();
  try {
    const client = await pool.connect();
    client.release();
    return true;
  } catch {
    return false;
  }
}

export async function setupTestDatabase(): Promise<void> {
  await runMigrations(TEST_DATABASE_URL);
}

export async function resetDatabase(): Promise<void> {
  const pool = getTestPool();
  await pool.query(`
    TRUNCATE TABLE appointments, time_blocks, professional_schedules, professionals, services, users CASCADE;
  `);
}

export function createFixedClock(date: Date | string): () => Date {
  const fixed = typeof date === "string" ? new Date(date) : date;
  return () => new Date(fixed.getTime());
}

export { createApp };
