import type { Pool } from "pg";
import { pool as defaultPool } from "../../db/pool.js";

export type DbAppointment = {
  id: string;
  client_id: string;
  professional_id: string;
  service_id: string;
  start_at: Date;
  end_at: Date;
  status: "reservado" | "cancelado" | "completado" | "ausente";
  price_cents: number;
  duration_minutes: number;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  // Joins opcionales
  client_name?: string;
  professional_name?: string;
  service_name?: string;
};

export class AppointmentsRepository {
  constructor(private pool: Pool = defaultPool as any) {}

  async findById(id: string): Promise<DbAppointment | null> {
    const res = await this.pool.query<DbAppointment>(
      `SELECT a.*, u.name as client_name, pu.name as professional_name, s.name as service_name
       FROM appointments a
       JOIN users u ON u.id = a.client_id
       JOIN professionals p ON p.id = a.professional_id
       JOIN users pu ON pu.id = p.user_id
       JOIN services s ON s.id = a.service_id
       WHERE a.id = $1 LIMIT 1;`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  async list(filters: {
    clientId?: string;
    professionalId?: string;
    from?: Date;
    to?: Date;
    status?: string;
  }): Promise<DbAppointment[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.clientId) {
      params.push(filters.clientId);
      conditions.push(`a.client_id = $${params.length}`);
    }

    if (filters.professionalId) {
      params.push(filters.professionalId);
      conditions.push(`a.professional_id = $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`a.status = $${params.length}`);
    }

    if (filters.from) {
      params.push(filters.from);
      conditions.push(`a.start_at >= $${params.length}`);
    }

    if (filters.to) {
      params.push(filters.to);
      conditions.push(`a.start_at <= $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const res = await this.pool.query<DbAppointment>(
      `SELECT a.*, u.name as client_name, pu.name as professional_name, s.name as service_name
       FROM appointments a
       JOIN users u ON u.id = a.client_id
       JOIN professionals p ON p.id = a.professional_id
       JOIN users pu ON pu.id = p.user_id
       JOIN services s ON s.id = a.service_id
       ${where}
       ORDER BY a.start_at ASC;`,
      params,
    );
    return res.rows;
  }

  async updateStatus(
    id: string,
    status: "cancelado" | "completado" | "ausente",
    extra: {
      cancelledAt?: Date;
      cancelReason?: string | null;
    } = {},
  ): Promise<DbAppointment | null> {
    const res = await this.pool.query<DbAppointment>(
      `UPDATE appointments
       SET status = $1, cancelled_at = $2, cancel_reason = $3
       WHERE id = $4
       RETURNING *;`,
      [status, extra.cancelledAt ?? null, extra.cancelReason ?? null, id],
    );
    return res.rows[0] ?? null;
  }
}
