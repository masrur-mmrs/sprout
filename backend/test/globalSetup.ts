import { Pool } from "pg";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../src/db/migrate.js";

/** Runs once in the main Vitest process, before any test file: brings sprout_test up to date. */
export default async function setup(project: TestProject): Promise<void> {
  const connectionString = project.config.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  try {
    await runMigrations(pool);
  } catch (err) {
    // Printed before rethrowing because Vitest 5.0.5 crashes while formatting a globalSetup error.
    // Host and database only: the connection string carries the password.
    const target = connectionString ? new URL(connectionString) : undefined;
    const reason = err instanceof Error ? err.message || (err as NodeJS.ErrnoException).code : err;
    console.error(
      `Could not migrate the test database at ${target ? target.host + target.pathname : "(unset)"}: ${reason}\n` +
        "Is `docker compose up` running? Export TEST_DATABASE_URL if Postgres isn't on localhost:5432.",
    );
    throw err;
  } finally {
    await pool.end();
  }
}
