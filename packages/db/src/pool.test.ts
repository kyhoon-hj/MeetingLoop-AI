import { describe, expect, it } from "vitest";
import { getDatabasePoolConfig } from "./pool";

describe("database pool configuration", () => {
  it("creates a local non-SSL pool configuration", () => {
    const config = getDatabasePoolConfig({
      DATABASE_URL: "postgresql://postgres:test-password@localhost:5432/meeting",
      DATABASE_SSL: "false",
      DB_POOL_MAX: "5"
    } as NodeJS.ProcessEnv);

    expect(config.connectionString).toContain("localhost:5432/meeting");
    expect(config.max).toBe(5);
    expect(config.ssl).toBe(false);
  });

  it("rejects a missing database URL", () => {
    expect(() => getDatabasePoolConfig({} as NodeJS.ProcessEnv)).toThrow("DATABASE_URL is required");
  });

  it("rejects invalid pool sizes", () => {
    expect(() => getDatabasePoolConfig({
      DATABASE_URL: "postgresql://localhost/meeting",
      DB_POOL_MAX: "0"
    } as NodeJS.ProcessEnv)).toThrow("DB_POOL_MAX must be a positive integer");
  });
});
