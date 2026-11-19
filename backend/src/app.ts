import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";

export type AppOptions = {
  corsOrigin?: string;
};

export function createApp(options: AppOptions = {}): Express {
  const app = express();
  app.use(helmet());
  app.use(
    cors({
      origin: options.corsOrigin ?? "http://localhost:5173",
    }),
  );
  app.use(express.json({ limit: "16kb" }));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}
