import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { forbidden } from "../../errors.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { ServicesService } from "./service.js";
import { ServicesRepository } from "./repository.js";

export function createServicesRouter(service?: ServicesService, pool?: Pool): Router {
  service ??= new ServicesService(new ServicesRepository(pool));
  const router = Router();

  const createSchema = z.object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(80, "El nombre no puede superar los 80 caracteres."),
    description: z.string().trim().default(""),
    durationMinutes: z
      .number({ invalid_type_error: "La duración debe ser un número entero." })
      .int()
      .min(15, "La duración mínima es de 15 minutos.")
      .max(240, "La duración máxima es de 240 minutos.")
      .refine((m) => m % 15 === 0, {
        message: "La duración debe ser múltiplo de 15 minutos.",
      }),
    priceCents: z
      .number({ invalid_type_error: "El precio debe ser un número entero." })
      .int()
      .nonnegative("El precio no puede ser negativo."),
  });

  const updateSchema = z.object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(80, "El nombre no puede superar los 80 caracteres.")
      .optional(),
    description: z.string().trim().optional(),
    durationMinutes: z
      .number()
      .int()
      .min(15, "La duración mínima es de 15 minutos.")
      .max(240, "La duración máxima es de 240 minutos.")
      .refine((m) => m % 15 === 0, {
        message: "La duración debe ser múltiplo de 15 minutos.",
      })
      .optional(),
    priceCents: z.number().int().nonnegative().optional(),
    active: z.boolean().optional(),
  });

  // GET /api/services
  router.get("/", authMiddleware(false, pool), async (req, res, next) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      if (includeInactive) {
        if (!req.user || req.user.role !== "administrador") {
          throw forbidden("Solo el administrador puede ver servicios inactivos.");
        }
      }
      const list = await service.list(includeInactive);
      res.status(200).json(list);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/services (solo admin)
  router.post(
    "/",
    authMiddleware(true, pool),
    requireRole("administrador"),
    async (req, res, next) => {
      try {
        const data = createSchema.parse(req.body);
        const created = await service.create(data);
        res.status(201).json(created);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /api/services/:id (solo admin)
  router.patch(
    "/:id",
    authMiddleware(true, pool),
    requireRole("administrador"),
    async (req, res, next) => {
      try {
        const id = req.params.id!;
        const data = updateSchema.parse(req.body);
        const updated = await service.update(id, data);
        res.status(200).json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
