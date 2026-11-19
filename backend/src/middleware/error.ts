import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: firstIssue?.message || "Datos de entrada inválidos.",
      },
    });
  }

  // Error de exclusión PostgreSQL 23P01 (solapamiento GiST)
  if (err && typeof err === "object" && "code" in err && err.code === "23P01") {
    return res.status(409).json({
      error: {
        code: "OVERLAP",
        message: "Ese horario ya está ocupado.",
      },
    });
  }

  // Error de clave única PostgreSQL 23505 (ej. email duplicado)
  if (err && typeof err === "object" && "code" in err && err.code === "23505") {
    return res.status(409).json({
      error: {
        code: "EMAIL_TAKEN",
        message: "El email ya está registrado.",
      },
    });
  }

  console.error("Error no controlado:", err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Ocurrió un error inesperado en el servidor.",
    },
  });
};
