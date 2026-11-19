import path from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "vitest/config";

// Cargar .env de la raíz del monorepo
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Una sola base de prueba: los archivos no pueden correr en paralelo.
    fileParallelism: false,
  },
});
