export type AppConfig = {
  databaseUrl: string;
  databaseUrlTest?: string;
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
    if (env.NODE_ENV === "test" || process.env.VITEST) {
      return {
        databaseUrl:
          env.DATABASE_URL?.trim() ||
          "postgresql://studio:studio@localhost:5432/studio_capilar",
        databaseUrlTest:
          env.DATABASE_URL_TEST?.trim() ||
          "postgresql://studio:studio@localhost:5432/studio_capilar_test",
        jwtSecret:
          env.JWT_SECRET?.trim() ||
          "test-jwt-secret-para-entorno-de-pruebas-12345678",
        port: 4000,
        corsOrigin: "http://localhost:5173",
      };
    }
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
    databaseUrlTest: env.DATABASE_URL_TEST?.trim() || undefined,
    jwtSecret,
    port,
    corsOrigin: env.CORS_ORIGIN?.trim() || "http://localhost:5173",
  };
}
