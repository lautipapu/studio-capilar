import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BACKEND_ENV_PATH, resolveTestSeedUrl } from "../src/db/seed.js";

describe("guardrails CLI seed:test", () => {
  it("resuelve backend/.env desde la ubicación del módulo", () => {
    const expectedPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../.env",
    );
    expect(BACKEND_ENV_PATH).toBe(expectedPath);
  });

  it("no usa DATABASE_URL si falta DATABASE_URL_TEST", () => {
    expect(() =>
      resolveTestSeedUrl({
        DATABASE_URL: "postgresql://main.example:5432/studio_capilar",
      }),
    ).toThrow(/DATABASE_URL_TEST esté definida/);
  });

  it("rechaza la misma base aunque cambien parámetros de conexión", () => {
    expect(() =>
      resolveTestSeedUrl({
        DATABASE_URL: "postgres://db.example:5432/studio_capilar?sslmode=require",
        DATABASE_URL_TEST: "postgresql://db.example:5432/studio_capilar?sslmode=disable",
      }),
    ).toThrow(/coincide con DATABASE_URL/);
  });

  it("acepta y devuelve exclusivamente el destino de pruebas", () => {
    const testUrl = "postgresql://test.example:5432/studio_capilar_test";
    expect(
      resolveTestSeedUrl({
        DATABASE_URL: "postgresql://main.example:5432/studio_capilar",
        DATABASE_URL_TEST: testUrl,
      }),
    ).toBe(testUrl);
  });
});
