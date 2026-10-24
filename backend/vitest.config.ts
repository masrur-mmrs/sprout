import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // Migrates sprout_test once, before any test file runs.
    globalSetup: ["test/globalSetup.ts"],
    // Test files share sprout_test and truncate it between tests, so they must not overlap.
    fileParallelism: false,
    // A valid value for every variable src/config/env.ts requires, so importing it never exits.
    env: {
      NODE_ENV: "test",
      // Vitest doesn't read .env: export TEST_DATABASE_URL if compose isn't on 5432 (POSTGRES_PORT).
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/sprout_test",
      JWT_SECRET: "test-only-jwt-secret-padded-to-32-chars",
      APP_URL: "http://localhost:3000",
      RESEND_API_KEY: "re_test_not_a_real_key",
      EMAIL_FROM: "Sprout <no-reply@sprout.test>",
      GCS_BINARY_BUCKET: "sprout-binaries-test",
      GCS_ICON_BUCKET: "sprout-icons-test",
      TRUST_PROXY_HOPS: "1",
    },
  },
});
