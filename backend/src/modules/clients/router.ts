import { Router } from "express";
import { z } from "zod";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { ClientsService } from "./service.js";

export function createClientsRouter(service = new ClientsService()): Router {
  const router = Router();

  const updateSchema = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    phone: z.string().trim().max(30).optional().nullable(),
    active: z.boolean().optional(),
  });

  // GET /api/clients (solo admin)
  router.get(
    "/",
    authMiddleware(true),
    requireRole("administrador"),
    async (req, res, next) => {
      try {
        const includeInactive = req.query.includeInactive === "true";
        const list = await service.list(includeInactive);
        res.status(200).json(list);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /api/clients/:id (solo admin)
  router.patch(
    "/:id",
    authMiddleware(true),
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
