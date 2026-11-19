import type { Pool } from "pg";
import { pool as defaultPool } from "../../db/pool.js";

export type DbClientUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  active: boolean;
  created_at: Date;
};

export class ClientsRepository {
  constructor(private pool: Pool = defaultPool as any) {}

  async list(includeInactive = false): Promise<DbClientUser[]> {
    const where = includeInactive
      ? "WHERE role = 'cliente'"
      : "WHERE role = 'cliente' AND active = true";
    const res = await this.pool.query<DbClientUser>(`
      SELECT id, name, email, phone, role, active, created_at
      FROM users
      ${where}
      ORDER BY name ASC;
    `);
    return res.rows;
  }

  async findById(id: string): Promise<DbClientUser | null> {
    const res = await this.pool.query<DbClientUser>(
      "SELECT id, name, email, phone, role, active, created_at FROM users WHERE id = $1 AND role = 'cliente' LIMIT 1;",
      [id],
    );
    return res.rows[0] ?? null;
  }

  async update(
    id: string,
    data: { name?: string; phone?: string | null; active?: boolean },
  ): Promise<DbClientUser | null> {
    const current = await this.findById(id);
    if (!current) return null;

    const name = data.name !== undefined ? data.name.trim() : current.name;
    const phone =
      data.phone !== undefined
        ? data.phone
          ? data.phone.trim()
          : null
        : current.phone;
    const active = data.active !== undefined ? data.active : current.active;

    const res = await this.pool.query<DbClientUser>(
      `UPDATE users
       SET name = $1, phone = $2, active = $3
       WHERE id = $4 AND role = 'cliente'
       RETURNING id, name, email, phone, role, active, created_at;`,
      [name, phone, active, id],
    );
    return res.rows[0] ?? null;
  }
}
