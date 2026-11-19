import pg from "pg";
import { loadConfig } from "../config.js";

const { Pool } = pg;

let defaultPool: pg.Pool | null = null;

export function createPool(connectionString?: string): pg.Pool {
  const url = connectionString ?? loadConfig().databaseUrl;
  const isSslNeeded = url.includes("sslmode=require") || url.includes("neon.tech");

  return new Pool({
    connectionString: url,
    ssl: isSslNeeded ? { rejectUnauthorized: false } : undefined,
  });
}

export function getPool(connectionString?: string): pg.Pool {
  if (connectionString) {
    return createPool(connectionString);
  }
  if (!defaultPool) {
    defaultPool = createPool();
  }
  return defaultPool;
}

export async function closePool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.end();
    defaultPool = null;
  }
}

export const pool = {
  query: <R extends pg.QueryResultRow = any>(
    text: string,
    params?: unknown[],
  ): Promise<pg.QueryResult<R>> => getPool().query<R>(text, params),
  connect: (): Promise<pg.PoolClient> => getPool().connect(),
  end: (): Promise<void> => closePool(),
};
