import type { Pool } from "pg";
import { afterAll, beforeEach } from "vitest";
import { pool } from "../../src/db/pool.js";

/**
 * Call at the top of a test file that touches Postgres, and use the pool it returns. The global
 * setup has already migrated sprout_test. This empties every table before each test and ends the
 * pool after the file. Files run one at a time (fileParallelism: false), so a TRUNCATE here can't
 * wipe rows another file is still using.
 */
export function useTestDb(): Pool {
  beforeEach(async () => {
    await pool.query("TRUNCATE users, password_resets, apps, reviews RESTART IDENTITY CASCADE");
  });
  afterAll(() => pool.end());
  return pool;
}

/** Row counts of every table, for asserting what an operation inserted or cascaded away. */
export async function rowCounts(): Promise<Record<string, number>> {
  const { rows } = await pool.query<Record<string, number>>(`
    SELECT (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM password_resets) AS password_resets,
           (SELECT count(*)::int FROM apps) AS apps,
           (SELECT count(*)::int FROM reviews) AS reviews
  `);
  return rows[0] ?? {};
}
