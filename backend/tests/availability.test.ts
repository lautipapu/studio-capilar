import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  closeTestPool,
  createFixedClock,
  getTestPool,
  isDatabaseAvailable,
  resetDatabase,
  setupTestDatabase,
} from "./helpers.js";

describe("T07 — Motor de Disponibilidad (CP-13, CP-15, CP-18)", () => {
  let dbAvailable = false;
  // Martes 1 de Diciembre de 2026, 08:00 hora de Buenos Aires (11:00 UTC)
  const fixedClock = createFixedClock("2026-12-01T11:00:00Z");
  const app = createApp({ clock: fixedClock, pool: getTestPool() });

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (!dbAvailable) {
      throw new Error("La base de datos de pruebas no está disponible.");
    }
    await setupTestDatabase();
  });

  afterAll(async () => {
    await closeTestPool();
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await resetDatabase();
    }
  });

  describe("Integración con base de datos real", () => {
    let profId: string;
    let serviceId: string;
    let clientId: string;

    beforeEach(async () => {
      if (!dbAvailable) return;
      const pool = getTestPool();
      const hash = await bcrypt.hash("clave1234", 10);

      // Crear profesional con horario solo el martes (weekday 2) de 10:00 a 14:00
      const uRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('pro.disp@studio.local', '${hash}', 'Pro Disp', 'profesional', true)
        RETURNING id;
      `);
      const pRes = await pool.query<{ id: string }>(`
        INSERT INTO professionals (user_id) VALUES ($1) RETURNING id;
      `, [uRes.rows[0]!.id]);

      profId = pRes.rows[0]!.id;

      await pool.query(`
        INSERT INTO professional_schedules (professional_id, weekday, start_time, end_time)
        VALUES ($1, 2, '10:00', '14:00');
      `, [profId]);

      // Crear servicio de 60 minutos
      const sRes = await pool.query<{ id: string }>(`
        INSERT INTO services (name, duration_minutes, price_cents, active)
        VALUES ('Corte Completo', 60, 200000, true) RETURNING id;
      `);
      serviceId = sRes.rows[0]!.id;

      // Crear cliente
      const cRes = await pool.query<{ id: string }>(`
        INSERT INTO users (email, password_hash, name, role, active)
        VALUES ('cliente.disp@studio.local', '${hash}', 'Cliente Disp', 'cliente', true)
        RETURNING id;
      `);
      clientId = cRes.rows[0]!.id;
    });

    it(
      "CP-13: Martes 10:00-14:00 con servicio de 60 min devuelve inicios 10:00 a 13:00 en grilla de 15 min; miércoles vacío",
      async () => {
        // Martes 2026-12-01
        const resTuesday = await request(app).get(
          `/api/professionals/${profId}/availability?serviceId=${serviceId}&date=2026-12-01`,
        );

        expect(resTuesday.status).toBe(200);
        expect(resTuesday.body.slots).toBeDefined();

        // 10:00, 10:15, 10:30, 10:45, 11:00, 11:15, 11:30, 11:45, 12:00, 12:15, 12:30, 12:45, 13:00
        // Total 13 slots
        expect(resTuesday.body.slots.length).toBe(13);

        // Miércoles 2026-12-02 (día sin horario) debe devolver lista vacía
        const resWednesday = await request(app).get(
          `/api/professionals/${profId}/availability?serviceId=${serviceId}&date=2026-12-02`,
        );

        expect(resWednesday.status).toBe(200);
        expect(resWednesday.body.slots).toEqual([]);
      },
    );

    it(
      "CP-15: Un bloqueo saca los huecos solapados de la disponibilidad",
      async () => {
        const pool = getTestPool();

        // Bloqueo de 11:00 a 12:30 hora local (14:00 a 15:30 UTC)
        await pool.query(`
          INSERT INTO time_blocks (professional_id, start_at, end_at, reason, created_by)
          VALUES ($1, '2026-12-01T14:00:00Z', '2026-12-01T15:30:00Z', 'Almuerzo', $2);
        `, [profId, clientId]);

        const res = await request(app).get(
          `/api/professionals/${profId}/availability?serviceId=${serviceId}&date=2026-12-01`,
        );

        expect(res.status).toBe(200);
        const slots = res.body.slots as string[];

        // Ningún slot generado debe cruzar el rango del bloqueo [14:00, 15:30) UTC
        for (const slot of slots) {
          const slotStart = new Date(slot).getTime();
          const slotEnd = slotStart + 60 * 60000;
          const blockStart = new Date("2026-12-01T14:00:00Z").getTime();
          const blockEnd = new Date("2026-12-01T15:30:00Z").getTime();

          const overlaps = slotStart < blockEnd && slotEnd > blockStart;
          expect(overlaps).toBe(false);
        }
      },
    );

    it(
      "CP-18: La lista respeta ocupación de turnos y grilla de 15 minutos",
      async () => {
        const pool = getTestPool();

        // Turno reservado de 10:00 a 10:45 hora local (13:00 a 13:45 UTC)
        await pool.query(`
          INSERT INTO appointments (
            client_id, professional_id, service_id, start_at, end_at, status, price_cents, duration_minutes
          ) VALUES (
            $1, $2, $3, '2026-12-01T13:00:00Z', '2026-12-01T13:45:00Z', 'reservado', 100000, 45
          );
        `, [clientId, profId, serviceId]);

        // Consulta servicio de 30 minutos
        const s30 = await pool.query<{ id: string }>(`
          INSERT INTO services (name, duration_minutes, price_cents, active)
          VALUES ('Lavado', 30, 50000, true) RETURNING id;
        `);

        const res = await request(app).get(
          `/api/professionals/${profId}/availability?serviceId=${s30.rows[0]!.id}&date=2026-12-01`,
        );

        expect(res.status).toBe(200);
        const slots = res.body.slots as string[];

        // 10:45 hora local (13:45 UTC) sí puede aparecer porque tocarse en el extremo es válido
        expect(slots).toContain("2026-12-01T13:45:00.000Z");

        // 10:00 a 10:30 no deben aparecer
        expect(slots).not.toContain("2026-12-01T13:00:00.000Z");
        expect(slots).not.toContain("2026-12-01T13:15:00.000Z");
        expect(slots).not.toContain("2026-12-01T13:30:00.000Z");
      },
    );

    it(
      "Fecha fuera del horizonte (hoy + 31 días) responde 200 con lista vacía",
      async () => {
        const res = await request(app).get(
          `/api/professionals/${profId}/availability?serviceId=${serviceId}&date=2027-01-15`,
        );

        expect(res.status).toBe(200);
        expect(res.body.slots).toEqual([]);
      },
    );
  });
});
