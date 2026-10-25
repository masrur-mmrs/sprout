import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a running frontend and backend. There's no `webServer` block: the
 * servers need throwaway-database env that doesn't belong in a committed file (CI adds it in
 * Phase 12). The specs write (sign-ups, reviews, downloads), so never point them at a database
 * you care about. Start both first, from a migrated and seeded throwaway database:
 *
 *   backend/:  NODE_ENV=development PORT=8087 DATABASE_URL=postgresql://…/<throwaway> \
 *              APP_URL=http://localhost:3000 JWT_SECRET=… (the rest of backend/.env.example) \
 *              npx tsx src/index.ts
 *   frontend/: BACKEND_URL=http://localhost:8087 npm run dev
 *
 * then `npm run test:e2e`. The specs can be re-run on the same database: they create their own
 * users and assert relative counts.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
// The specs write data, so a deployed URL has to be asked for, not reached by a stray env var.
if (new URL(baseURL).hostname !== "localhost" && process.env.E2E_ALLOW_REMOTE !== "1") {
  throw new Error(
    `E2E_BASE_URL is ${baseURL}. The specs sign up users and post reviews; set E2E_ALLOW_REMOTE=1 to run them anywhere but localhost.`,
  );
}

export default defineConfig({
  testDir: "e2e",
  // One at a time: the backend's in-memory rate limiters and the database are shared.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  use: {
    // localhost, not 127.0.0.1: the backend's Origin check accepts exactly APP_URL.
    baseURL,
    // No traces: they record request headers and form fields, i.e. session cookies and passwords.
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
