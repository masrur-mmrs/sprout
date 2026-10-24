import type { Queryable } from "../../db/pool.js";
import type { Category } from "./categories.js";

/** The only app shape that leaves the backend. Never `file_url` (INV-4). */
export interface PublicApp {
  id: number;
  developer_id: number;
  title: string;
  tagline: string;
  description: string;
  category: Category;
  version: string;
  icon_url: string | null;
  download_count: number;
  created_at: Date;
  updated_at: Date;
}

/** A PublicApp with its review aggregate. `avg_rating` is null for an app with no reviews. */
export interface DeveloperApp extends PublicApp {
  avg_rating: number | null;
  review_count: number;
}

/** Where a row's files live. Internal only: never send it. */
export interface StoredFiles {
  file_url: string;
  icon_url: string | null;
}

/**
 * PublicApp's columns, for every SELECT and RETURNING that sends an app. Static, never built from
 * input, and used instead of `*`, which would include file_url. Statements alias `apps` as `a`.
 */
export const APP_COLUMNS =
  "a.id, a.developer_id, a.title, a.tagline, a.description, a.category, a.version, a.icon_url, " +
  "a.download_count, a.created_at, a.updated_at";

export async function insertApp(
  db: Queryable,
  app: {
    developerId: number;
    title: string;
    tagline: string;
    description: string;
    category: Category;
    version: string;
    fileUrl: string;
    iconUrl: string | null;
  },
): Promise<PublicApp> {
  const { rows } = await db.query<PublicApp>(
    `INSERT INTO apps AS a (developer_id, title, tagline, description, category, version,
                           file_url, icon_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${APP_COLUMNS}`,
    [
      app.developerId,
      app.title,
      app.tagline,
      app.description,
      app.category,
      app.version,
      app.fileUrl,
      app.iconUrl,
    ],
  );
  if (!rows[0]) throw new Error("INSERT INTO apps returned no row");
  return rows[0];
}

/**
 * Locks the developer's row until the transaction ends. Every write that points an app at an
 * upload takes it first, so two requests with the same key can't both pass the "unused" check.
 * Only the developer's own apps can hold their keys. NO KEY UPDATE doesn't block the foreign-key
 * checks of inserts that reference the user.
 */
export async function lockDeveloperUploads(db: Queryable, developerId: number): Promise<void> {
  await db.query("SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE", [developerId]);
}

/** Whether an app other than `exceptAppId` already stores this file URL or icon URL. */
export async function findUrlConflicts(
  db: Queryable,
  urls: { fileUrl: string | null; iconUrl: string | null },
  exceptAppId: number | null,
): Promise<{ binary_taken: boolean; icon_taken: boolean }> {
  const { rows } = await db.query<{ binary_taken: boolean; icon_taken: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM apps WHERE file_url = $1 AND id IS DISTINCT FROM $3) AS binary_taken,
            EXISTS (SELECT 1 FROM apps WHERE icon_url = $2 AND id IS DISTINCT FROM $3) AS icon_taken`,
    [urls.fileUrl, urls.iconUrl, exceptAppId],
  );
  return rows[0] ?? { binary_taken: false, icon_taken: false };
}

/** The owner's app's files, row-locked until the transaction ends. Null if not theirs or missing. */
export async function lockOwnedApp(
  db: Queryable,
  appId: number,
  developerId: number,
): Promise<StoredFiles | null> {
  const { rows } = await db.query<StoredFiles>(
    "SELECT file_url, icon_url FROM apps WHERE id = $1 AND developer_id = $2 FOR UPDATE",
    [appId, developerId],
  );
  return rows[0] ?? null;
}

/** Sets the given fields and leaves undefined ones as they are. Null if not theirs or missing. */
export async function updateOwnedApp(
  db: Queryable,
  appId: number,
  developerId: number,
  changes: {
    title?: string;
    tagline?: string;
    description?: string;
    category?: Category;
    version?: string;
    fileUrl: string | null;
    iconUrl: string | null;
  },
): Promise<PublicApp | null> {
  const { rows } = await db.query<PublicApp>(
    `UPDATE apps AS a
     SET title = COALESCE($3, title),
         tagline = COALESCE($4, tagline),
         description = COALESCE($5, description),
         category = COALESCE($6, category),
         version = COALESCE($7, version),
         file_url = COALESCE($8, file_url),
         icon_url = COALESCE($9, icon_url),
         updated_at = NOW()
     WHERE a.id = $1 AND a.developer_id = $2
     RETURNING ${APP_COLUMNS}`,
    [
      appId,
      developerId,
      changes.title ?? null,
      changes.tagline ?? null,
      changes.description ?? null,
      changes.category ?? null,
      changes.version ?? null,
      changes.fileUrl,
      changes.iconUrl,
    ],
  );
  return rows[0] ?? null;
}

/** Deletes the owner's app (its reviews cascade) and returns its files. Null if not theirs or missing. */
export async function deleteOwnedApp(
  db: Queryable,
  appId: number,
  developerId: number,
): Promise<StoredFiles | null> {
  const { rows } = await db.query<StoredFiles>(
    "DELETE FROM apps WHERE id = $1 AND developer_id = $2 RETURNING file_url, icon_url",
    [appId, developerId],
  );
  return rows[0] ?? null;
}

/** The developer's apps with their review aggregate, most recently updated first. */
export async function listDeveloperApps(
  db: Queryable,
  developerId: number,
): Promise<DeveloperApp[]> {
  // The casts keep pg from returning AVG (numeric) and COUNT (bigint) as strings.
  const { rows } = await db.query<DeveloperApp>(
    `SELECT ${APP_COLUMNS},
            AVG(r.rating)::float8 AS avg_rating,
            COUNT(r.id)::int AS review_count
     FROM apps a
     LEFT JOIN reviews r ON r.app_id = a.id
     WHERE a.developer_id = $1
     GROUP BY a.id
     ORDER BY a.updated_at DESC, a.id DESC`,
    [developerId],
  );
  return rows;
}

/**
 * Counts one download and returns what the redirect needs, or null for an unknown app. The only
 * statement that changes download_count (INV-3): one atomic UPDATE, so concurrent downloads are
 * never lost.
 */
export async function countDownload(
  db: Queryable,
  appId: number,
): Promise<{ file_url: string; title: string; version: string } | null> {
  const { rows } = await db.query<{ file_url: string; title: string; version: string }>(
    `UPDATE apps SET download_count = download_count + 1
     WHERE id = $1
     RETURNING file_url, title, version`,
    [appId],
  );
  return rows[0] ?? null;
}
