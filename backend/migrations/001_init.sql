-- Extensiones requeridas
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('cliente', 'profesional', 'administrador');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('reservado', 'cancelado', 'completado', 'ausente');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  phone text,
  role user_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_name_len CHECK (char_length(name) BETWEEN 2 AND 80),
  CONSTRAINT users_phone_len CHECK (phone IS NULL OR char_length(phone) <= 30)
);

-- Tabla de servicios del catálogo
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL,
  price_cents integer NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT services_duration CHECK (
    duration_minutes BETWEEN 15 AND 240 AND duration_minutes % 15 = 0
  ),
  CONSTRAINT services_price CHECK (price_cents >= 0),
  CONSTRAINT services_name_len CHECK (char_length(name) BETWEEN 2 AND 80)
);

-- Ficha de profesionales
CREATE TABLE IF NOT EXISTS professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users (id),
  bio text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Horario semanal del profesional (1 tramo continuo por día laboral)
CREATE TABLE IF NOT EXISTS professional_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals (id) ON DELETE CASCADE,
  weekday smallint NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  CONSTRAINT schedule_weekday CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT schedule_time CHECK (end_time > start_time),
  CONSTRAINT schedule_unique UNIQUE (professional_id, weekday)
);

-- Bloqueos de agenda
CREATE TABLE IF NOT EXISTS time_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES professionals (id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocks_range CHECK (end_at > start_at)
);

-- Turnos
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES users (id),
  professional_id uuid NOT NULL REFERENCES professionals (id),
  service_id uuid NOT NULL REFERENCES services (id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status appointment_status NOT NULL DEFAULT 'reservado',
  price_cents integer NOT NULL,
  duration_minutes integer NOT NULL,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointments_range CHECK (end_at > start_at),
  CONSTRAINT appointments_duration CHECK (duration_minutes BETWEEN 15 AND 240)
);

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS appointments_professional_start_idx ON appointments (professional_id, start_at);
CREATE INDEX IF NOT EXISTS appointments_client_start_idx ON appointments (client_id, start_at);
CREATE INDEX IF NOT EXISTS time_blocks_professional_start_idx ON time_blocks (professional_id, start_at);

-- Restricción de exclusión para evitar solapamientos concurrentes
DO $$ BEGIN
  ALTER TABLE appointments
    ADD CONSTRAINT appointments_no_overlap
    EXCLUDE USING gist (
      professional_id WITH =,
      tstzrange(start_at, end_at, '[)') WITH &&
    )
    WHERE (status = 'reservado');
EXCEPTION
  WHEN duplicate_table OR duplicate_object THEN null;
END $$;
