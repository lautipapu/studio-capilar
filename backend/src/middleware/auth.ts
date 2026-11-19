import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import type { Clock } from "../clock.js";
import { loadConfig } from "../config.js";
import { pool as defaultPool } from "../db/pool.js";
import { forbidden, unauthorized } from "../errors.js";

export type UserRole = "cliente" | "profesional" | "administrador";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  professionalId?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      clock: Clock;
    }
  }
}

export type TokenPayload = {
  sub: string;
  role: UserRole;
};

export function createToken(
  user: { id: string; role: UserRole },
  secret = loadConfig().jwtSecret,
): string {
  return jwt.sign({ sub: user.id, role: user.role }, secret, {
    expiresIn: "8h",
  });
}

export function authMiddleware(
  required = true,
  pool = defaultPool,
  jwtSecret?: string,
): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (required) {
        return next(unauthorized("Se requiere token de autenticación."));
      }
      return next();
    }

    const token = authHeader.slice(7).trim();
    const secret = jwtSecret ?? loadConfig().jwtSecret;

    try {
      const decoded = jwt.verify(token, secret) as TokenPayload;
      if (!decoded.sub) {
        return next(unauthorized("Token inválido."));
      }

      // Cargar usuario vivo de la base de datos (D5: verificar que no fue desactivado)
      const res = await pool.query<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: UserRole;
        active: boolean;
      }>(
        "SELECT id, email, name, phone, role, active FROM users WHERE id = $1;",
        [decoded.sub],
      );

      const user = res.rows[0];
      if (!user) {
        return next(unauthorized("Usuario no encontrado."));
      }

      if (!user.active) {
        return next(unauthorized("Usuario inactivo."));
      }

      let professionalId: string | undefined;
      if (user.role === "profesional") {
        const profRes = await pool.query<{ id: string }>(
          "SELECT id FROM professionals WHERE user_id = $1;",
          [user.id],
        );
        professionalId = profRes.rows[0]?.id;
      }

      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        active: user.active,
        professionalId,
      };

      next();
    } catch {
      return next(unauthorized("Token inválido o expirado."));
    }
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(forbidden());
    }
    next();
  };
}
