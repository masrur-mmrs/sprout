import type { Queryable } from "../../db/pool.js";
import type { AppSort, ListAppsQuery } from "./apps.schemas.js";
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

/** A browse or search card. `avg_rating` is null for an app with no reviews. */
export interface AppSummary {
  id: number;
  title: string;
  tagline: string;
  category: Category;
  icon_url: string | null;
  download_count: number;
  avg_rating: number | null;
  review_count: number;
}

export interface SearchResult extends AppSummary {
  match_score: number;
}

export interface AppPage {
  items: AppSummary[];
  page: number;
  pageSize: number;
  total: number;
}

/** The detail page's app: no ownership needed, so it names the developer by username only. */
export interface AppDetail extends DeveloperApp {
  developer_username: string;
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

/** AppSummary's columns and review aggregate, for statements that `LEFT JOIN reviews r` and group. */
const SUMMARY_COLUMNS =
  "a.id, a.title, a.tagline, a.category, a.icon_url, a.download_count, " +
  // The casts keep pg from returning AVG (numeric) and COUNT (bigint) as strings. COUNT(r.id), not
  // COUNT(*): an app with no reviews still has one joined row, of NULLs.
  "AVG(r.rating)::float8 AS avg_rating, COUNT(r.id)::int AS review_count";

/**
 * The only ORDER BY text a request can pick, keyed by the validated `sort`. Postgres puts NULLs
 * first under DESC, so unrated apps need NULLS LAST. The trailing id keeps pages from overlapping.
 */
const LIST_ORDER: Readonly<Record<AppSort, string>> = {
  popular: "a.download_count DESC, a.id DESC",
  new: "a.created_at DESC, a.id DESC",
  "top-rated": "avg_rating DESC NULLS LAST, review_count DESC, a.id DESC",
};

/** Search results per query. */
export const SEARCH_LIMIT = 12;

/**
 * Adds AppSummary's columns to a statement that picks at most SEARCH_LIMIT `(id, match_score)`
 * rows, so the review aggregate is computed for those rows only, not for every match.
 */
const withSummaries = (matches: string) =>
  `SELECT ${SUMMARY_COLUMNS}, m.match_score
   FROM (${matches}) m
   JOIN apps a ON a.id = m.id
   LEFT JOIN reviews r ON r.app_id = a.id
   GROUP BY a.id, m.match_score
   ORDER BY m.match_score DESC, a.download_count DESC, a.id DESC`;

/**
 * The plan's fuzzy search (blueprint §5 with the G4 description fix), served by the trigram
 * indexes. `$1` is the trimmed query. Exported so the EXPLAIN test checks this exact text.
 */
export const FUZZY_SEARCH_SQL = withSummaries(
  `SELECT id,
          GREATEST(similarity(title, $1), word_similarity($1, description) * 0.6)::float8
            AS match_score
   FROM apps
   WHERE title % $1 OR $1 <% description
   ORDER BY match_score DESC, download_count DESC, id DESC
   LIMIT ${SEARCH_LIMIT}`,
);

/** Under 3 characters, trigrams are unreliable: match a title prefix. `$2` is prefixPattern($1). */
const PREFIX_SEARCH_SQL = withSummaries(
  `SELECT id, similarity(title, $1)::float8 AS match_score
   FROM apps
   WHERE title ILIKE $2 ESCAPE '\\'
   ORDER BY match_score DESC, download_count DESC, id DESC
   LIMIT ${SEARCH_LIMIT}`,
);

/** `q` as an ILIKE prefix pattern whose own `\`, `%` and `_` match literally. */
function prefixPattern(q: string): string {
  return `${q.replace(/[\\%_]/g, "\\$&")}%`;
}

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

/** One page of apps, optionally in one category, and how many apps the filter matches in all. */
export async function listApps(
  db: Queryable,
  { category, sort, page, pageSize }: ListAppsQuery,
): Promise<AppPage> {
  // Object.hasOwn: a key like "constructor" can't reach the SQL even if a caller skips the schema.
  if (!Object.hasOwn(LIST_ORDER, sort)) throw new Error("Unknown app sort");
  const categoryFilter = "($1::varchar IS NULL OR a.category = $1)";
  const [items, count] = await Promise.all([
    db.query<AppSummary>(
      `SELECT ${SUMMARY_COLUMNS}
       FROM apps a
       LEFT JOIN reviews r ON r.app_id = a.id
       WHERE ${categoryFilter}
       GROUP BY a.id
       ORDER BY ${LIST_ORDER[sort]}
       LIMIT $2 OFFSET $3`,
      [category ?? null, pageSize, (page - 1) * pageSize],
    ),
    db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM apps a WHERE ${categoryFilter}`,
      [category ?? null],
    ),
  ]);
  return { items: items.rows, page, pageSize, total: count.rows[0]?.total ?? 0 };
}

/** The best matches for a trimmed, non-empty query, best first. */
export async function searchApps(db: Queryable, q: string): Promise<SearchResult[]> {
  // Code points, not UTF-16 units, so two emoji are still a short query.
  if ([...q].length < 3) {
    return (await db.query<SearchResult>(PREFIX_SEARCH_SQL, [q, prefixPattern(q)])).rows;
  }
  // Trigrams come only from letters and digits, so a query like "!!!" can't match anything, yet
  // the index can't rule a row out either: Postgres would scan every description to find that.
  if (!/[\p{L}\p{N}]/u.test(q)) return [];
  return (await db.query<SearchResult>(FUZZY_SEARCH_SQL, [q])).rows;
}

/** Any app, with its developer's username and review aggregate. Null if there is no such app. */
export async function findAppDetail(db: Queryable, appId: number): Promise<AppDetail | null> {
  // Only the username from users: never email or password_hash.
  const { rows } = await db.query<AppDetail>(
    `SELECT ${APP_COLUMNS},
            AVG(r.rating)::float8 AS avg_rating,
            COUNT(r.id)::int AS review_count,
            u.username AS developer_username
     FROM apps a
     JOIN users u ON u.id = a.developer_id
     LEFT JOIN reviews r ON r.app_id = a.id
     WHERE a.id = $1
     GROUP BY a.id, u.username`,
    [appId],
  );
  return rows[0] ?? null;
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
