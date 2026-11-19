export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const validationError = (msg = "Datos de entrada inválidos.") =>
  new AppError(400, "VALIDATION_ERROR", msg);

export const unauthorized = (msg = "Autenticación requerida.") =>
  new AppError(401, "UNAUTHORIZED", msg);

export const invalidCredentials = (msg = "Credenciales inválidas.") =>
  new AppError(401, "INVALID_CREDENTIALS", msg);

export const forbidden = (msg = "No tiene permiso para realizar esta acción.") =>
  new AppError(403, "FORBIDDEN", msg);

export const notFound = (msg = "Recurso no encontrado.") =>
  new AppError(404, "NOT_FOUND", msg);

export const emailTaken = (msg = "El email ya está registrado.") =>
  new AppError(409, "EMAIL_TAKEN", msg);

export const overlap = (msg = "Ese horario ya está ocupado.") =>
  new AppError(409, "OVERLAP", msg);

export const pastDate = (
  msg = "La fecha debe ser estrictamente posterior al instante actual.",
) => new AppError(422, "PAST_DATE", msg);

export const outsideWorkingHours = (
  msg = "El turno se encuentra fuera del horario de atención.",
) => new AppError(422, "OUTSIDE_WORKING_HOURS", msg);

export const inactive = (
  msg = "El usuario o profesional se encuentra inactivo.",
) => new AppError(422, "INACTIVE", msg);

export const inactiveService = (msg = "El servicio se encuentra inactivo.") =>
  new AppError(422, "INACTIVE_SERVICE", msg);

export const lateCancel = (
  msg = "No es posible cancelar con menos de 24 horas de anticipación.",
) => new AppError(422, "LATE_CANCEL", msg);

export const invalidTransition = (
  msg = "Transición de estado no permitida.",
) => new AppError(422, "INVALID_TRANSITION", msg);

export const invalidSlot = (
  msg = "El horario debe alinearse a la grilla de 15 minutos.",
) => new AppError(422, "INVALID_SLOT", msg);

export const outsideHorizon = (
  msg = "No se puede reservar más allá del horizonte de 30 días.",
) => new AppError(422, "OUTSIDE_HORIZON", msg);

export const invalidBlock = (
  msg = "El bloqueo debe tener fecha de fin posterior al inicio y en el futuro.",
) => new AppError(422, "INVALID_BLOCK", msg);
