import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "../src/config/env.js";

const complete = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/sprout_dev",
  JWT_SECRET: "a".repeat(32),
  APP_URL: "http://localhost:3000/",
  RESEND_API_KEY: "re_123",
  EMAIL_FROM: "Sprout <no-reply@sprout.test>",
  GCS_BINARY_BUCKET: "sprout-binaries",
  GCS_ICON_BUCKET: "sprout-icons",
  TRUST_PROXY_HOPS: "1",
};

function errorFor(source: Record<string, string | undefined>): string {
  try {
    parseEnv(source);
  } catch (err) {
    expect(err).toBeInstanceOf(EnvValidationError);
    return (err as Error).message;
  }
  throw new Error("expected parseEnv to throw");
}

describe("parseEnv", () => {
  it("parses a complete environment and applies defaults", () => {
    expect(parseEnv(complete)).toMatchObject({
      NODE_ENV: "development",
      PORT: 8080,
      TRUST_PROXY_HOPS: 1,
      APP_URL: "http://localhost:3000",
    });
  });

  it("names every missing required variable", () => {
    const message = errorFor({});
    for (const key of Object.keys(complete)) {
      expect(message).toContain(`${key}: is required but not set`);
    }
  });

  it("treats an empty value as unset", () => {
    expect(errorFor({ ...complete, RESEND_API_KEY: "" })).toContain(
      "RESEND_API_KEY: is required but not set",
    );
  });

  it("rejects a JWT_SECRET shorter than 32 characters without echoing it", () => {
    const message = errorFor({ ...complete, JWT_SECRET: "too-short-secret" });
    expect(message).toContain("JWT_SECRET: must be at least 32 characters");
    expect(message).not.toContain("too-short-secret");
  });

  it("rejects a non-http APP_URL", () => {
    expect(errorFor({ ...complete, APP_URL: "ftp://example.com" })).toContain("APP_URL:");
  });
});

describe("server startup", () => {
  it("exits with code 1 and a clear error when required env is missing", () => {
    const backendDir = fileURLToPath(new URL("..", import.meta.url));
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/index.ts"], {
      cwd: backendDir,
      env: { PATH: process.env.PATH },
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid environment configuration");
    expect(result.stderr).toContain("DATABASE_URL: is required but not set");
  }, 20_000);
});
