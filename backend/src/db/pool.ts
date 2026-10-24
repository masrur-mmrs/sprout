import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "../config/env.js";

/**
 * What query modules take as `db`: the injected pool (`createApp({ db })`), or the client inside
 * `withTransaction`. They never import `pool` or `query()` directly, so tests control the database.
 */
export type Queryable = Pick<PoolClient, "query">;

/** The process-wide Postgres pool. `src/index.ts` ends it on shutdown. */
export const pool = new Pool({ connectionString: env.DATABASE_URL });

// An idle client errors when Postgres restarts or drops the connection. The pool discards that
// client itself; without a listener the 'error' event would crash the process.
pool.on("error", (err) => {
  console.error(`Idle Postgres client error: ${err.message}`);
});

/** Runs one parameterized statement (`$1…`) on any free pooled connection. */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/**
 * Runs `fn` between BEGIN and COMMIT on one checked-out client, and rolls back if it throws.
 * Statements inside `fn` must use the `client` it receives: `query()` would run outside the
 * transaction on a different connection.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      // The connection is unusable: destroy it below instead of returning it to the pool.
      broken = true;
    });
    throw err;
  } finally {
    client.release(broken);
  }
}
