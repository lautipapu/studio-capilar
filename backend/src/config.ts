export type AppConfig = {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  corsOrigin: string;
};

function required(name: string, value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return name;
  }
  return null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing = [
    required("DATABASE_URL", env.DATABASE_URL),
    required("JWT_SECRET", env.JWT_SECRET),
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    console.error(`Faltan variables de entorno: ${missing.join(", ")}`);
    process.exit(1);
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  const jwtSecret = env.JWT_SECRET?.trim();
  if (!databaseUrl || !jwtSecret) {
    console.error("Faltan variables de entorno: DATABASE_URL, JWT_SECRET");
    process.exit(1);
  }

  const rawPort = env.PORT?.trim() || "4000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error("PORT debe ser un entero entre 1 y 65535.");
    process.exit(1);
  }

  return {
    databaseUrl,
    jwtSecret,
    port,
    corsOrigin: env.CORS_ORIGIN?.trim() || "http://localhost:5173",
  };
}
