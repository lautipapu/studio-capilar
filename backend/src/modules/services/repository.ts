import type { Pool } from "pg";
import { pool as defaultPool } from "../../db/pool.js";

export type DbService = {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
  created_at: Date;
};

export class ServicesRepository {
  constructor(private pool: Pool = defaultPool as any) {}

  async list(includeInactive = false): Promise<DbService[]> {
    const query = includeInactive
      ? "SELECT * FROM services ORDER BY name ASC;"
      : "SELECT * FROM services WHERE active = true ORDER BY name ASC;";
    const res = await this.pool.query<DbService>(query);
    return res.rows;
  }

  async findById(id: string): Promise<DbService | null> {
    const res = await this.pool.query<DbService>(
      "SELECT * FROM services WHERE id = $1 LIMIT 1;",
      [id],
    );
    return res.rows[0] ?? null;
  }

  async create(data: {
    name: string;
    description: string;
    durationMinutes: number;
    priceCents: number;
  }): Promise<DbService> {
    const res = await this.pool.query<DbService>(
      `INSERT INTO services (name, description, duration_minutes, price_cents, active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *;`,
      [data.name.trim(), data.description.trim(), data.durationMinutes, data.priceCents],
    );
    return res.rows[0]!;
  }

  async update(
    id: string,
    data: {
      name?: string;
      description?: string;
      durationMinutes?: number;
      priceCents?: number;
      active?: boolean;
    },
  ): Promise<DbService | null> {
    const current = await this.findById(id);
    if (!current) return null;

    const name = data.name !== undefined ? data.name.trim() : current.name;
    const description =
      data.description !== undefined
        ? data.description.trim()
        : current.description;
    const durationMinutes =
      data.durationMinutes !== undefined
        ? data.durationMinutes
        : current.duration_minutes;
    const priceCents =
      data.priceCents !== undefined ? data.priceCents : current.price_cents;
    const active = data.active !== undefined ? data.active : current.active;

    const res = await this.pool.query<DbService>(
      `UPDATE services
       SET name = $1, description = $2, duration_minutes = $3, price_cents = $4, active = $5
       WHERE id = $6
       RETURNING *;`,
      [name, description, durationMinutes, priceCents, active, id],
    );
    return res.rows[0] ?? null;
  }
}
