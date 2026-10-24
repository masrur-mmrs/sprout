import { existsSync, realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Pool, PoolClient } from "pg";

// Resolved from this module, so it works from src/ (tsx) and dist/ (Phase 12 copies the .sql files).
const MIGRATIONS_DIR = new URL("./migrations/", import.meta.url);

// Any fixed bigint works: it only has to be the same for every runner of this schema.
const MIGRATION_LOCK_KEY = 5_407_710_001;

/**
 * Applies each `migrations/*.sql` file not yet recorded in `schema_migrations`, in lexical order,
 * one transaction per file. Returns the versions it applied, so an up-to-date schema returns [].
 * It imports nothing from config/env, so the Vitest global setup can call it with its own pool.
 */
export async function runMigrations(pool: Pool): Promise<string[]> {
  const client = await pool.connect();
  try {
    // Concurrent runners (parallel test processes, overlapping Cloud Run jobs) queue up here.
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    return await applyPending(client);
  } finally {
    // Destroying the connection ends the session, which releases the lock however the run ended.
    client.release(true);
  }
}

async function applyPending(client: PoolClient): Promise<string[]> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  const { rows } = await client.query<{ version: string }>("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.version));
  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    const version = file.slice(0, -".sql".length);
    if (applied.has(version)) continue;

    const sql = await readFile(new URL(file, MIGRATIONS_DIR), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
    } catch (err) {
      // Best effort: the connection is destroyed afterwards, and the migration error matters more.
      await client.query("ROLLBACK").catch(() => undefined);
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Migration ${file} failed: ${reason}`, { cause: err });
    }
    newlyApplied.push(version);
  }
  return newlyApplied;
}

async function main(): Promise<void> {
  // Imported here so that importing runMigrations never validates env or opens a pool.
  const { pool } = await import("./pool.js");
  try {
    const applied = await runMigrations(pool);
    console.log(
      applied.length > 0
        ? `Applied ${applied.length} migration(s): ${applied.join(", ")}`
        : "No pending migrations: the schema is up to date.",
    );
  } finally {
    await pool.end();
  }
}

// Run only when executed directly (npm run db:migrate, node dist/db/migrate.js), not when imported.
// argv[1] may not be a file at all (node -e), and realpathSync would throw on import.
const entry = process.argv[1];
if (entry && existsSync(entry) && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
