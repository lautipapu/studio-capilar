import { Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { authMiddleware } from "../../middleware/auth.js";
import { AuthService } from "./service.js";
import { AuthRepository } from "./repository.js";

export function createAuthRouter(service?: AuthService, pool?: Pool): Router {
  service ??= new AuthService(new AuthRepository(pool));
  const router = Router();

  const registerSchema = z.object({
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
    phone: z
      .string()
      .trim()
      .max(30, "El teléfono no puede superar los 30 caracteres.")
      .optional()
      .nullable(),
    role: z.any().optional(),
  });

  const loginSchema = z.object({
    email: z.string().trim().email("Formato de email inválido."),
    password: z.string().min(1, "La contraseña es requerida."),
  });

  router.post("/register", async (req, res, next) => {
    try {
      const data = registerSchema.parse(req.body);
      const result = await service.register({
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const data = loginSchema.parse(req.body);
      const result = await service.login(data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get("/me", authMiddleware(true, pool), (req, res) => {
    const user = req.user!;
    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        ...(user.professionalId ? { professionalId: user.professionalId } : {}),
      },
    });
  });

  return router;
}
