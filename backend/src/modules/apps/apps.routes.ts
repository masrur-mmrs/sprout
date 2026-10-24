import { Router, type Request, type RequestHandler, type Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import type { Pool } from "pg";
import { HttpError } from "../../lib/errors.js";
import { validate } from "../../lib/validate.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import type { StorageService } from "../../services/storage/storage.js";
import { findAppDetail, listApps, listDeveloperApps, searchApps } from "./apps.queries.js";
import {
  appIdParamsSchema,
  createAppSchema,
  listAppsQuerySchema,
  searchQuerySchema,
  updateAppSchema,
  uploadRequestSchema,
  type AppIdParams,
  type CreateAppInput,
  type ListAppsQuery,
  type SearchQuery,
  type UpdateAppInput,
  type UploadRequest,
} from "./apps.schemas.js";
import { deleteApp, issueUploadUrl, publishApp, startDownload, updateApp } from "./apps.service.js";
import { CATEGORIES } from "./categories.js";

/** Per client IP, per app. Enough for a real user's retries; an abuse guard on download_count. */
export const DOWNLOADS_PER_MINUTE = 20;
/**
 * Per developer account. Each URL can store up to 500 MiB, or a public icon, and every app needs
 * its own binary upload, so this also caps how fast one account can publish apps.
 */
export const UPLOADS_PER_HOUR = 30;

/** Set per route, not per router: Phase 6's public browse routes choose their own caching. */
const noStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

/** The caller's id, on routes behind requireAuth. */
function callerId(req: Request): number {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return req.user.id;
}

function appsRateLimiter(options: {
  windowMs: number;
  limit: number;
  message: string;
  keyGenerator: (req: Request, res: Response) => string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    keyGenerator: options.keyGenerator,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, "RATE_LIMITED", options.message));
    },
  });
}

/**
 * Counts only downloads someone opened. Browsers label each request (Fetch Metadata), so a
 * cross-site page that embeds the URL (an <img>, a fetch, a hidden iframe) is refused instead of
 * counting a download for every visitor. Same-site requests, a link followed from another site,
 * and clients that send no such headers (curl, older browsers) pass.
 */
const openedDirectly: RequestHandler = (req, _res, next) => {
  const navigation =
    req.get("sec-fetch-mode") === "navigate" && req.get("sec-fetch-dest") === "document";
  if (req.get("sec-fetch-site") !== "cross-site" || navigation) return next();
  next(new HttpError(403, "FORBIDDEN", "Open the download link directly."));
};

/**
 * `/api/apps/*`: browse, search, detail, writes and downloads. The contract, mirrored by the
 * frontend's `lib/api/types.ts`:
 *
 * - `GET /?category=&sort=&page=&pageSize=` (anyone) → 200 `{ items: AppSummary[], page, pageSize,
 *   total }`. `sort` is `popular` (default: most downloaded), `new` (most recently published) or
 *   `top-rated` (highest average, unrated apps last; ties go to more reviews). `category` is
 *   optional and exactly one of `/api/categories`; leave it out for every category, since `""` is
 *   a 400. URL-encode it (`URLSearchParams`): `Music & Audio` is `Music%20%26%20Audio`. `page` is
 *   1–1000 (default 1), `pageSize` 1–48 (default 24). `total` counts every app the filter matches,
 *   so a page past the end is `items: []` with the real `total`. Anything else, or any repeated
 *   parameter, is 400 VALIDATION_ERROR.
 * - `GET /search?q=` (anyone) → 200 `(AppSummary & { match_score: number })[]`, best match first,
 *   at most 12, no pagination. `q` is trimmed and must then be 1–100 characters as `String.length`
 *   counts them (UTF-16 units), without NUL. From 3 code points it is a typo-tolerant `pg_trgm`
 *   match on the title, or on any word of the description, and needs a letter or digit to match
 *   anything; under 3 it matches the start of the title, case-insensitively, with `%`, `_` and
 *   `\` taken literally. `match_score` is 0–1, for ordering only. No matches is `[]`.
 * - `GET /:id` (anyone) → 200 `AppDetail`. 404 NOT_FOUND for an unknown id.
 * - `POST /uploads` (developer) `{ kind: "binary" | "icon", filename, contentType, size }` → 200
 *   `{ uploadUrl, key, headers }`. PUT the file to `uploadUrl` within 15 minutes, sending exactly
 *   `headers`, then pass `key` as `binaryKey` or `iconKey`. Binaries end in .zip .dmg .apk .exe
 *   .msi .pkg .deb or .AppImage (any case) and are at most 500 MiB; their `contentType` is ignored
 *   and they upload as application/octet-stream. Icons are image/png, image/webp or image/jpeg
 *   with a matching extension, at most 1 MiB. `filename` is sanitized into the key. 429
 *   RATE_LIMITED after 30 requests in an hour from one account.
 * - `POST /` (developer) `{ title, tagline, description, category, version, binaryKey, iconKey? }`
 *   → 201 `PublicApp`. title ≤ 100, tagline ≤ 255, description ≤ 5000 characters (all trimmed,
 *   non-empty); category from `/api/categories`; version like `1.2`, `1.2.3` or `1.2.3-beta.1`,
 *   ≤ 20 characters. A key that isn't one `/uploads` issued is 400 VALIDATION_ERROR; one issued to
 *   another account is 403 FORBIDDEN; one whose upload never arrived is 400 VALIDATION_ERROR; one
 *   another app already uses is 409 CONFLICT. The details name the field.
 * - `PATCH /:id` (owner) any non-empty subset of the create fields → 200 `PublicApp`. New keys get
 *   the same checks, and the file they replace is deleted. The icon can be replaced, not removed.
 * - `DELETE /:id` (owner) → 204. The app's reviews and files go too.
 * - `GET /:id/download` (anyone) → 302 to a signed URL valid for 5 minutes, which downloads as
 *   `{title}-{version}{ext}`, and counts one download. 429 RATE_LIMITED after 20 per minute from
 *   one IP for one app. 403 FORBIDDEN, uncounted, when another site embeds the URL instead of
 *   linking to it. HEAD is 405, so probes don't count.
 *
 * `PublicApp` is `{ id, developer_id, title, tagline, description, category, version,
 * icon_url: string | null, download_count, created_at, updated_at }`, timestamps as ISO 8601
 * strings. `AppSummary` is `{ id, title, tagline, category, icon_url: string | null,
 * download_count, avg_rating: number | null, review_count: number }`, `avg_rating` null with no
 * reviews. `AppDetail` is a `PublicApp` plus `{ developer_username, avg_rating: number | null,
 * review_count: number }`. Another developer's app is 404 NOT_FOUND to writes, never 403. A
 * non-numeric or out-of-range `:id` is 400. Failures use the error envelope; every response is
 * `Cache-Control: no-store`, so counts, ratings and a developer's edits show at once.
 */
export function createAppsRouter({ db, storage }: { db: Pool; storage: StorageService }): Router {
  const router = Router();
  const developerOnly = [noStore, requireAuth(db), requireRole("developer")];
  // Built per app, not at module scope, so each createApp() (and each test) counts from zero.
  // After requireRole, so the key is the account, and before validate, so rejected requests count.
  const uploadLimiter = appsRateLimiter({
    windowMs: 60 * 60_000,
    limit: UPLOADS_PER_HOUR,
    message: "Too many uploads. Try again later.",
    keyGenerator: (req) => String(callerId(req)),
  });
  // After validate, so the key uses the parsed id, and before the handler, so a blocked request
  // isn't counted.
  const downloadLimiter = appsRateLimiter({
    windowMs: 60_000,
    limit: DOWNLOADS_PER_MINUTE,
    message: "Too many downloads. Try again in a minute.",
    keyGenerator: (req, res) => {
      const { id }: AppIdParams = res.locals.params;
      // ipKeyGenerator groups an IPv6 client's /56, so it can't rotate addresses within it.
      return `${ipKeyGenerator(req.ip ?? "")}:${id}`;
    },
  });

  router.get("/", noStore, validate(listAppsQuerySchema, "query"), async (_req, res) => {
    const query: ListAppsQuery = res.locals.query;
    res.status(200).json(await listApps(db, query));
  });

  // Before "/:id", which would otherwise take "search" as an id and answer 400.
  router.get("/search", noStore, validate(searchQuerySchema, "query"), async (_req, res) => {
    const { q }: SearchQuery = res.locals.query;
    res.status(200).json(await searchApps(db, q));
  });

  router.get("/:id", noStore, validate(appIdParamsSchema, "params"), async (_req, res) => {
    const { id }: AppIdParams = res.locals.params;
    const app = await findAppDetail(db, id);
    if (!app) throw new HttpError(404, "NOT_FOUND", "App not found.");
    res.status(200).json(app);
  });

  router.post(
    "/uploads",
    ...developerOnly,
    uploadLimiter,
    validate(uploadRequestSchema, "body"),
    async (req, res) => {
      const input: UploadRequest = req.body;
      res.status(200).json(await issueUploadUrl(storage, callerId(req), input));
    },
  );

  router.post("/", ...developerOnly, validate(createAppSchema, "body"), async (req, res) => {
    const input: CreateAppInput = req.body;
    res.status(201).json(await publishApp(db, storage, callerId(req), input));
  });

  router.patch(
    "/:id",
    ...developerOnly,
    validate(appIdParamsSchema, "params"),
    validate(updateAppSchema, "body"),
    async (req, res) => {
      const { id }: AppIdParams = res.locals.params;
      const input: UpdateAppInput = req.body;
      res.status(200).json(await updateApp(db, storage, callerId(req), id, input));
    },
  );

  router.delete(
    "/:id",
    ...developerOnly,
    validate(appIdParamsSchema, "params"),
    async (req, res) => {
      const { id }: AppIdParams = res.locals.params;
      await deleteApp(db, storage, callerId(req), id);
      res.status(204).end();
    },
  );

  // Express would otherwise run the GET handler for HEAD, so link checkers and download managers'
  // probes would each count a download.
  router.head("/:id/download", noStore, (_req, res) => {
    res.status(405).set("Allow", "GET").end();
  });

  router.get(
    "/:id/download",
    noStore,
    validate(appIdParamsSchema, "params"),
    openedDirectly,
    downloadLimiter,
    async (_req, res) => {
      const { id }: AppIdParams = res.locals.params;
      res.redirect(302, await startDownload(db, storage, id));
    },
  );

  return router;
}

/**
 * `GET /api/developer/apps` (developer) → 200 `DeveloperApp[]`: the caller's apps, most recently
 * updated first. `DeveloperApp` is a `PublicApp` plus `avg_rating: number | null` (null with no
 * reviews) and `review_count: number`. `Cache-Control: no-store`.
 */
export function createDeveloperAppsRouter({ db }: { db: Pool }): Router {
  const router = Router();

  router.get("/", noStore, requireAuth(db), requireRole("developer"), async (req, res) => {
    res.status(200).json(await listDeveloperApps(db, callerId(req)));
  });

  return router;
}

/**
 * `GET /api/categories` (anyone) → 200 `string[]`: every category, in display order. The list
 * only changes with a deploy, so it is `Cache-Control: public, max-age=3600`.
 */
export function createCategoriesRouter(): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600").status(200).json(CATEGORIES);
  });

  return router;
}
