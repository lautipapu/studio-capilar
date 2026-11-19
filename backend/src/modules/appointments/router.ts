import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { AppointmentsService } from "./service.js";

export function createAppointmentsRouter(
  service = new AppointmentsService(),
): Router {
  const router = Router();

  const createSchema = z.object({
    professionalId: z.string().uuid("professionalId debe ser UUID."),
    serviceId: z.string().uuid("serviceId debe ser UUID."),
    startAt: z.string().datetime({ message: "startAt debe ser formato ISO-8601." }),
    clientId: z.string().uuid("clientId debe ser UUID.").optional(),
  });

  const cancelSchema = z.object({
    reason: z.string().trim().optional(),
  });

  // POST /api/appointments (cliente o admin)
  router.post("/", authMiddleware(true), async (req, res, next) => {
    try {
      const data = createSchema.parse(req.body);
      const app = await service.create(data, req.user!, req.clock);
      res.status(201).json(app);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/appointments (autenticado, filtrado según rol)
  router.get("/", authMiddleware(true), async (req, res, next) => {
    try {
      const { from, to, status, clientId, professionalId } = req.query;
      const list = await service.list(
        req.user!,
        {
          from: typeof from === "string" ? from : undefined,
          to: typeof to === "string" ? to : undefined,
          status: typeof status === "string" ? status : undefined,
          clientId: typeof clientId === "string" ? clientId : undefined,
          professionalId:
            typeof professionalId === "string" ? professionalId : undefined,
        },
        req.clock,
      );
      res.status(200).json(list);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/appointments/:id (autenticado, comprueba titular)
  router.get("/:id", authMiddleware(true), async (req, res, next) => {
    try {
      const id = req.params.id!;
      const app = await service.getById(id, req.user!);
      res.status(200).json(app);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/appointments/:id/cancel
  router.post("/:id/cancel", authMiddleware(true), async (req, res, next) => {
    try {
      const id = req.params.id!;
      const { reason } = cancelSchema.parse(req.body || {});
      const app = await service.cancel(
        id,
        req.user!,
        reason,
        req.clock,
      );
      res.status(200).json(app);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/appointments/:id/complete
  router.post("/:id/complete", authMiddleware(true), async (req, res, next) => {
    try {
      const id = req.params.id!;
      const app = await service.complete(id, req.user!, req.clock);
      res.status(200).json(app);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/appointments/:id/no-show
  router.post("/:id/no-show", authMiddleware(true), async (req, res, next) => {
    try {
      const id = req.params.id!;
      const app = await service.noShow(id, req.user!, req.clock);
      res.status(200).json(app);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
