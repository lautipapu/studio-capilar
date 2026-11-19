import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Una sola base de prueba: los archivos no pueden correr en paralelo.
    fileParallelism: false,
  },
});
