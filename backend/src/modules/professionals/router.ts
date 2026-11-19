import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { forbidden, validationError } from "../../errors.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { ProfessionalsService } from "./service.js";
import { ProfessionalsRepository } from "./repository.js";
import { ServicesRepository } from "../services/repository.js";

export function createProfessionalsRouter(
  service?: ProfessionalsService,
  pool?: Pool,
): Router {
  service ??= new ProfessionalsService(
    new ProfessionalsRepository(pool),
    new ServicesRepository(pool),
    pool,
  );
  const router = Router();

  const createProfSchema = z.object({
    name: z
      .string()
      .trim()
      .min(2, "El nombre debe tener al menos 2 caracteres.")
      .max(80, "El nombre no puede superar los 80 caracteres."),
    email: z.string().trim().email("Formato de email inválido."),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .regex(/[A-Za-z]/, "La contraseña debe contener al menos una letra.")
      .regex(/[0-9]/, "La contraseña debe contener al menos un número."),
    phone: z.string().trim().max(30).optional().nullable(),
    bio: z.string().trim().default(""),
  });

  const updateProfSchema = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().max(30).optional().nullable(),
    bio: z.string().trim().optional(),
    active: z.boolean().optional(),
  });

  const scheduleSchema = z.object({
    days: z.array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        startTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, "Formato de hora inválido (HH:mm)."),
        endTime: z
          .string()
          .regex(/^\d{2}:\d{2}$/, "Formato de hora inválido (HH:mm)."),
      }),
    ),
  });

  const blockSchema = z.object({
    startAt: z.string().datetime({ message: "startAt debe ser ISO-8601." }),
    endAt: z.string().datetime({ message: "endAt debe ser ISO-8601." }),
    reason: z.string().trim().optional(),
  });

  function checkTitularOrAdmin(req: any, profId: string) {
    if (!req.user) throw forbidden("Autenticación requerida.");
    if (
      req.user.role === "administrador" ||
      req.user.professionalId === profId
    ) {
      return;
    }
    throw forbidden(
      "No tiene permiso para operar sobre la agenda de este profesional.",
    );
  }

  // GET /api/professionals
  router.get("/", authMiddleware(false, pool), async (req, res, next) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      if (includeInactive) {
        if (!req.user || req.user.role !== "administrador") {
          throw forbidden("Solo el administrador puede ver profesionales inactivos.");
        }
      }
      const list = await service.list(includeInactive);
      res.status(200).json(list);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/professionals/:id/availability (público)
  router.get("/:id/availability", async (req, res, next) => {
    try {
      const id = req.params.id!;
      const { serviceId, date } = req.query;
      if (!serviceId || typeof serviceId !== "string") {
        throw validationError("serviceId es requerido.");
      }
      if (!date || typeof date !== "string") {
        throw validationError("date es requerido (YYYY-MM-DD).");
      }
      const result = await service.getAvailability(
        id,
        serviceId,
        date,
        req.clock,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/professionals/:id/blocks (admin o titular)
  router.get("/:id/blocks", authMiddleware(true, pool), async (req, res, next) => {
    try {
      const id = req.params.id!;
      checkTitularOrAdmin(req, id);
      const { from, to } = req.query;
      if (!from || !to || typeof from !== "string" || typeof to !== "string") {
        throw validationError("Los parámetros from y to son requeridos.");
      }
      const blocks = await service.listBlocks(id, from, to);
      res.status(200).json(blocks);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/professionals/:id/blocks (admin o titular)
  router.post("/:id/blocks", authMiddleware(true, pool), async (req, res, next) => {
    try {
      const id = req.params.id!;
      checkTitularOrAdmin(req, id);
      const data = blockSchema.parse(req.body);
      const created = await service.createBlock(
        id,
        data,
        req.user!.id,
        req.clock,
      );
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/professionals/:id/blocks/:blockId (admin o titular)
  router.delete(
    "/:id/blocks/:blockId",
    authMiddleware(true, pool),
    async (req, res, next) => {
      try {
        const id = req.params.id!;
        const blockId = req.params.blockId!;
        checkTitularOrAdmin(req, id);
        await service.deleteBlock(id, blockId, req.clock);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    },
  );

  // PUT /api/professionals/:id/schedule (admin o titular)
  router.put("/:id/schedule", authMiddleware(true, pool), async (req, res, next) => {
    try {
      const id = req.params.id!;
      checkTitularOrAdmin(req, id);
      const data = scheduleSchema.parse(req.body);
      const result = await service.replaceSchedule(id, data.days);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/professionals/:id
  router.get("/:id", authMiddleware(false, pool), async (req, res, next) => {
    try {
      const id = req.params.id!;
      const isAdmin = req.user?.role === "administrador";
      const p = await service.getById(id, isAdmin);
      res.status(200).json(p);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/professionals (admin)
  router.post(
    "/",
    authMiddleware(true, pool),
    requireRole("administrador"),
    async (req, res, next) => {
      try {
        const data = createProfSchema.parse(req.body);
        const created = await service.create(data);
        res.status(201).json(created);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /api/professionals/:id (admin)
  router.patch(
    "/:id",
    authMiddleware(true, pool),
    requireRole("administrador"),
    async (req, res, next) => {
      try {
        const id = req.params.id!;
        const data = updateProfSchema.parse(req.body);
        const updated = await service.update(id, data);
        res.status(200).json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
