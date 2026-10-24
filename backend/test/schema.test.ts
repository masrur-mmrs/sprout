import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../src/db/migrate.js";
import { rowCounts, useTestDb } from "./helpers/db.js";

const pool = useTestDb();

async function insertReturningId(text: string, params: unknown[]): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(text, params);
  if (!rows[0]) throw new Error(`Expected one row back from: ${text}`);
  return rows[0].id;
}

function createUser(username: string, role: "developer" | "user" = "user"): Promise<number> {
  return insertReturningId(
    "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, 'not-a-real-hash', $3) RETURNING id",
    [username, `${username}@sprout.test`, role],
  );
}

function createApp(developerId: number | null): Promise<number> {
  return insertReturningId(
    `INSERT INTO apps (developer_id, title, tagline, description, category, version, file_url)
     VALUES ($1, 'Test App', 'A tagline', 'A description', 'Other', '1.0.0', 'gs://test/app.zip')
     RETURNING id`,
    [developerId],
  );
}

function insertReview(appId: number, userId: number, rating: number | null) {
  return pool.query("INSERT INTO reviews (app_id, user_id, rating) VALUES ($1, $2, $3)", [
    appId,
    userId,
    rating,
  ]);
}

async function appAndReviewer(): Promise<{ developerId: number; appId: number; userId: number }> {
  const developerId = await createUser("dev", "developer");
  return { developerId, appId: await createApp(developerId), userId: await createUser("reviewer") };
}

describe("migrations", () => {
  it("apply nothing on a second run", async () => {
    // The global setup already migrated sprout_test, so this is the repeat run.
    expect(await runMigrations(pool)).toEqual([]);

    const files = await readdir(new URL("../src/db/migrations/", import.meta.url));
    const { rows } = await pool.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    expect(rows.map((row) => row.version)).toEqual(
      files.filter((name) => name.endsWith(".sql")).map((name) => name.slice(0, -".sql".length)),
    );
  });

  it("install pg_trgm", async () => {
    const { rowCount } = await pool.query("SELECT * FROM pg_extension WHERE extname = 'pg_trgm'");
    expect(rowCount).toBe(1);
  });
});

describe("schema constraints", () => {
  it.each([
    { rating: 6, code: "23514" }, // check_violation
    { rating: 0, code: "23514" },
    { rating: null, code: "23502" }, // not_null_violation
  ])("rejects a review with rating $rating", async ({ rating, code }) => {
    const { appId, userId } = await appAndReviewer();
    await expect(insertReview(appId, userId, rating)).rejects.toMatchObject({ code });
  });

  it("rejects a second review of the same app by the same user with 23505", async () => {
    const { appId, userId } = await appAndReviewer();
    await insertReview(appId, userId, 4);

    await expect(insertReview(appId, userId, 5)).rejects.toMatchObject({
      code: "23505",
      constraint: "unique_user_app_review",
    });
  });

  it("rejects an app without a developer and a negative download count", async () => {
    await expect(createApp(null)).rejects.toMatchObject({ code: "23502" });

    const { appId } = await appAndReviewer();
    await expect(
      pool.query("UPDATE apps SET download_count = -1 WHERE id = $1", [appId]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("cascades a user delete through their apps to those apps' reviews", async () => {
    const { developerId, appId, userId } = await appAndReviewer();
    await insertReview(appId, userId, 5);
    await pool.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')",
      [developerId, "0".repeat(64)],
    );

    await pool.query("DELETE FROM users WHERE id = $1", [developerId]);

    // Only the reviewer is left.
    expect(await rowCounts()).toEqual({ users: 1, password_resets: 0, apps: 0, reviews: 0 });
  });

  it("removes a deleted reviewer's reviews but keeps the app", async () => {
    const { appId, userId } = await appAndReviewer();
    await insertReview(appId, userId, 5);

    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    expect(await rowCounts()).toEqual({ users: 1, password_resets: 0, apps: 1, reviews: 0 });
  });
});
