import type { Pool, PoolClient } from "pg";
import { pool as defaultPool } from "../../db/pool.js";

export type DbProfessional = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  bio: string;
  active: boolean;
  user_active: boolean;
  created_at: Date;
};

export type DbSchedule = {
  id: string;
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

export type DbTimeBlock = {
  id: string;
  professional_id: string;
  start_at: Date;
  end_at: Date;
  reason: string;
  created_by: string;
  created_at: Date;
};

export class ProfessionalsRepository {
  constructor(private pool: Pool = defaultPool as any) {}

  async list(includeInactive = false): Promise<DbProfessional[]> {
    const where = includeInactive
      ? ""
      : "WHERE p.active = true AND u.active = true";
    const res = await this.pool.query<DbProfessional>(`
      SELECT p.id, p.user_id, u.name, u.email, u.phone, p.bio, p.active, u.active as user_active, p.created_at
      FROM professionals p
      JOIN users u ON u.id = p.user_id
      ${where}
      ORDER BY u.name ASC;
    `);
    return res.rows;
  }

  async findById(id: string): Promise<DbProfessional | null> {
    const res = await this.pool.query<DbProfessional>(
      `SELECT p.id, p.user_id, u.name, u.email, u.phone, p.bio, p.active, u.active as user_active, p.created_at
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 LIMIT 1;`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  async findByUserId(userId: string): Promise<DbProfessional | null> {
    const res = await this.pool.query<DbProfessional>(
      `SELECT p.id, p.user_id, u.name, u.email, u.phone, p.bio, p.active, u.active as user_active, p.created_at
       FROM professionals p
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id = $1 LIMIT 1;`,
      [userId],
    );
    return res.rows[0] ?? null;
  }

  async getSchedule(professionalId: string): Promise<DbSchedule[]> {
    const res = await this.pool.query<DbSchedule>(
      `SELECT id, professional_id, weekday, start_time::text, end_time::text
       FROM professional_schedules
       WHERE professional_id = $1
       ORDER BY weekday ASC;`,
      [professionalId],
    );
    return res.rows.map((r) => ({
      ...r,
      start_time: r.start_time.slice(0, 5),
      end_time: r.end_time.slice(0, 5),
    }));
  }

  async replaceSchedule(
    professionalId: string,
    days: { weekday: number; startTime: string; endTime: string }[],
  ): Promise<DbSchedule[]> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");
      await client.query(
        "DELETE FROM professional_schedules WHERE professional_id = $1;",
        [professionalId],
      );

      for (const day of days) {
        await client.query(
          `INSERT INTO professional_schedules (professional_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3, $4);`,
          [professionalId, day.weekday, day.startTime, day.endTime],
        );
      }

      await client.query("COMMIT;");
      return this.getSchedule(professionalId);
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  async create(data: {
    userId: string;
    bio: string;
  }): Promise<{ id: string }> {
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO professionals (user_id, bio, active)
       VALUES ($1, $2, true)
       RETURNING id;`,
      [data.userId, data.bio.trim()],
    );
    return res.rows[0]!;
  }

  async update(
    id: string,
    data: {
      name?: string;
      phone?: string | null;
      bio?: string;
      active?: boolean;
    },
  ): Promise<DbProfessional | null> {
    const current = await this.findById(id);
    if (!current) return null;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      if (
        data.name !== undefined ||
        data.phone !== undefined ||
        data.active !== undefined
      ) {
        const newName = data.name !== undefined ? data.name.trim() : current.name;
        const newPhone =
          data.phone !== undefined
            ? data.phone
              ? data.phone.trim()
              : null
            : current.phone;
        const newActive =
          data.active !== undefined ? data.active : current.user_active;

        await client.query(
          `UPDATE users SET name = $1, phone = $2, active = $3 WHERE id = $4;`,
          [newName, newPhone, newActive, current.user_id],
        );
      }

      if (data.bio !== undefined || data.active !== undefined) {
        const newBio = data.bio !== undefined ? data.bio.trim() : current.bio;
        const newActive =
          data.active !== undefined ? data.active : current.active;

        await client.query(
          `UPDATE professionals SET bio = $1, active = $2 WHERE id = $3;`,
          [newBio, newActive, id],
        );
      }

      await client.query("COMMIT;");
      return this.findById(id);
    } catch (err) {
      await client.query("ROLLBACK;");
      throw err;
    } finally {
      client.release();
    }
  }

  // --- Bloqueos ---
  async listBlocks(
    professionalId: string,
    from: Date,
    to: Date,
  ): Promise<DbTimeBlock[]> {
    const res = await this.pool.query<DbTimeBlock>(
      `SELECT * FROM time_blocks
       WHERE professional_id = $1 AND start_at < $3 AND end_at > $2
       ORDER BY start_at ASC;`,
      [professionalId, from, to],
    );
    return res.rows;
  }

  async findBlockById(blockId: string): Promise<DbTimeBlock | null> {
    const res = await this.pool.query<DbTimeBlock>(
      "SELECT * FROM time_blocks WHERE id = $1 LIMIT 1;",
      [blockId],
    );
    return res.rows[0] ?? null;
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.pool.query("DELETE FROM time_blocks WHERE id = $1;", [blockId]);
  }
}
