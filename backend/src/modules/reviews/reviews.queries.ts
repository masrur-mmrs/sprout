import { DatabaseError } from "pg";
import type { Queryable } from "../../db/pool.js";
import { REVIEWS_PAGE_SIZE } from "./reviews.schemas.js";

/** The only review shape that leaves the backend: the reviewer by username, never id or email. */
export interface Review {
  id: number;
  username: string;
  rating: number;
  comment: string | null;
  created_at: Date;
}

export interface ReviewPage {
  items: Review[];
  page: number;
  pageSize: number;
  total: number;
  /** The viewer's own review (also somewhere in the full list), or null. */
  mine: Review | null;
}

/**
 * Review's columns, for statements that alias `reviews r` and `JOIN users u ON u.id = r.user_id`.
 * Only the username from users: never email or password_hash.
 */
const REVIEW_COLUMNS = "r.id, u.username, r.rating, r.comment, r.created_at";

/**
 * One page of an app's reviews, newest first, with the total and the viewer's own review. Null if
 * there is no such app. The id tie-break keeps pages apart when reviews share a `created_at`.
 */
export async function listReviews(
  db: Queryable,
  appId: number,
  page: number,
  viewerId: number | null,
): Promise<ReviewPage | null> {
  const [count, items, mine] = await Promise.all([
    // No row at all for an unknown app.
    db.query<{ total: number }>(
      `SELECT (SELECT count(*)::int FROM reviews r WHERE r.app_id = a.id) AS total
       FROM apps a
       WHERE a.id = $1`,
      [appId],
    ),
    db.query<Review>(
      `SELECT ${REVIEW_COLUMNS}
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.app_id = $1
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $2 OFFSET $3`,
      [appId, REVIEWS_PAGE_SIZE, (page - 1) * REVIEWS_PAGE_SIZE],
    ),
    viewerId === null
      ? null
      : db.query<Review>(
          `SELECT ${REVIEW_COLUMNS}
           FROM reviews r
           JOIN users u ON u.id = r.user_id
           WHERE r.app_id = $1 AND r.user_id = $2`,
          [appId, viewerId],
        ),
  ]);
  const total = count.rows[0]?.total;
  if (total === undefined) return null;
  return {
    items: items.rows,
    page,
    pageSize: REVIEWS_PAGE_SIZE,
    total,
    mine: mine?.rows[0] ?? null,
  };
}

/**
 * Creates or replaces the user's review of the app (INV-2: one statement, so concurrent writes
 * leave one row). An edit resets `created_at`, which moves the review to the top of the list.
 * Null if there is no such app, or the user is its developer: the self-review ban is in the
 * statement, not left to the caller.
 */
export async function upsertReview(
  db: Queryable,
  review: { appId: number; userId: number; rating: number; comment: string | null },
): Promise<Review | null> {
  try {
    const { rows } = await db.query<Review>(
      `WITH saved AS (
         INSERT INTO reviews AS r (app_id, user_id, rating, comment)
         SELECT a.id, $2, $3, $4
         FROM apps a
         WHERE a.id = $1 AND a.developer_id <> $2
         ON CONFLICT ON CONSTRAINT unique_user_app_review
         DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, created_at = NOW()
         RETURNING r.id, r.user_id, r.rating, r.comment, r.created_at
       )
       SELECT r.id, u.username, r.rating, r.comment, r.created_at
       FROM saved r
       JOIN users u ON u.id = r.user_id`,
      [review.appId, review.userId, review.rating, review.comment],
    );
    return rows[0] ?? null;
  } catch (err) {
    // The app was deleted after the statement read it but before its foreign-key check: no such
    // app. Not mapped globally, since a 23503 on another foreign key isn't a 404.
    if (
      err instanceof DatabaseError &&
      err.code === "23503" &&
      err.constraint === "reviews_app_id_fkey"
    ) {
      return null;
    }
    throw err;
  }
}

/** The app's developer, or null if there is no such app. */
export async function findAppDeveloperId(db: Queryable, appId: number): Promise<number | null> {
  const { rows } = await db.query<{ developer_id: number }>(
    "SELECT developer_id FROM apps WHERE id = $1",
    [appId],
  );
  return rows[0]?.developer_id ?? null;
}

/** Deletes the user's review of the app. False if they had none (or there is no such app). */
export async function deleteReview(db: Queryable, appId: number, userId: number): Promise<boolean> {
  const { rowCount } = await db.query("DELETE FROM reviews WHERE app_id = $1 AND user_id = $2", [
    appId,
    userId,
  ]);
  return (rowCount ?? 0) > 0;
}
