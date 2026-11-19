import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Pool } from "pg";
import { systemClock, type Clock } from "./clock.js";
import { notFound } from "./errors.js";
import { errorHandler } from "./middleware/error.js";
import { createAppointmentsRouter } from "./modules/appointments/router.js";
import { createAuthRouter } from "./modules/auth/router.js";
import { createClientsRouter } from "./modules/clients/router.js";
import { createProfessionalsRouter } from "./modules/professionals/router.js";
import { createServicesRouter } from "./modules/services/router.js";

export type AppOptions = {
  corsOrigin?: string;
  clock?: Clock;
  pool?: Pool;
};

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  const clock = options.clock ?? systemClock;

  app.use(helmet());
  app.use(
    cors({
      origin: options.corsOrigin ?? "http://localhost:5173",
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  // Inyectar reloj en cada request
  app.use((req, _res, next) => {
    req.clock = clock;
    next();
  });

  // Ruta pública de salud
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Módulos de la API
  app.use("/api/auth", createAuthRouter());
  app.use("/api/services", createServicesRouter());
  app.use("/api/professionals", createProfessionalsRouter());
  app.use("/api/appointments", createAppointmentsRouter());
  app.use("/api/clients", createClientsRouter());

  // Manejo de 404 para rutas no existentes
  app.use((_req, _res, next) => {
    next(notFound("Ruta no encontrada."));
  });

  // Manejador centralizado de errores
  app.use(errorHandler);

  return app;
}
