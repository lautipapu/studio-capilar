import type { Pool } from "pg";
import { pool as defaultPool } from "../../db/pool.js";
import type { UserRole } from "../../middleware/auth.js";

export type DbUser = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  created_at: Date;
};

export class AuthRepository {
  constructor(private pool: Pool = defaultPool as any) {}

  async findByEmail(email: string): Promise<DbUser | null> {
    const res = await this.pool.query<DbUser>(
      "SELECT * FROM users WHERE email = $1 LIMIT 1;",
      [email.toLowerCase().trim()],
    );
    return res.rows[0] ?? null;
  }

  async findById(id: string): Promise<DbUser | null> {
    const res = await this.pool.query<DbUser>(
      "SELECT * FROM users WHERE id = $1 LIMIT 1;",
      [id],
    );
    return res.rows[0] ?? null;
  }

  async createClient(data: {
    email: string;
    passwordHash: string;
    name: string;
    phone?: string | null;
  }): Promise<DbUser> {
    const res = await this.pool.query<DbUser>(
      `INSERT INTO users (email, password_hash, name, phone, role, active)
       VALUES ($1, $2, $3, $4, 'cliente', true)
       RETURNING *;`,
      [
        data.email.toLowerCase().trim(),
        data.passwordHash,
        data.name.trim(),
        data.phone ? data.phone.trim() : null,
      ],
    );
    return res.rows[0]!;
  }
}
