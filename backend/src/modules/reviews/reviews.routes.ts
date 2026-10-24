import { Router, type Request, type RequestHandler } from "express";
import type { Pool } from "pg";
import { HttpError } from "../../lib/errors.js";
import { validate } from "../../lib/validate.js";
import { optionalAuth, requireAuth } from "../../middleware/auth.js";
import { appIdParamsSchema, type AppIdParams } from "../apps/apps.schemas.js";
import { deleteReview, findAppDeveloperId, listReviews, upsertReview } from "./reviews.queries.js";
import {
  listReviewsQuerySchema,
  putReviewSchema,
  type ListReviewsQuery,
  type PutReviewInput,
} from "./reviews.schemas.js";

// Redeclared rather than exported from apps.routes.ts, which belongs to Phases 5 and 6.
const noStore: RequestHandler = (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
};

/** The caller's id, on routes behind requireAuth. */
function callerId(req: Request): number {
  if (!req.user) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return req.user.id;
}

/**
 * `/api/apps/:id/reviews`: one review per user per app. The contract, mirrored by the frontend's
 * `lib/api/types.ts`:
 *
 * - `GET /?page=` (anyone) → 200 `{ items: Review[], page, pageSize, total, mine: Review | null }`,
 *   newest first, 20 a page. `page` is 1–1000 (default 1); any other value, or a repeated `page`,
 *   is 400 VALIDATION_ERROR. `total` counts every review of the app, so it equals the detail's
 *   `review_count`, and a page past the end is `items: []` with the real `total`. `items` includes
 *   the viewer's own review; `mine` is that review again, or null when signed out (an invalid or
 *   expired cookie counts as signed out) or not yet reviewed.
 * - `PUT /` (signed in, any role) `{ rating, comment? }` → 200 `Review`, whether it created the
 *   review or replaced it. `rating` is a JSON integer from 1 to 5, never a string. `comment` is
 *   trimmed, at most 2000 characters (UTF-16 units), without NUL; newlines are kept, and a missing,
 *   null or blank comment is stored as null. The body is the whole review: leaving `comment` out
 *   clears the old one. Other fields, such as `user_id` or `app_id`, are ignored. An edit resets
 *   `created_at`, so an edited review moves to the top of the list. 403 FORBIDDEN for the app's
 *   developer, who can't review their own app.
 * - `DELETE /` (signed in) → 204. 404 NOT_FOUND `Review not found.` if the caller has no review of
 *   the app, including when there is no such app.
 *
 * `Review` is `{ id, username, rating, comment: string | null, created_at }`, `created_at` as an
 * ISO 8601 string. An unknown app is 404 NOT_FOUND `App not found.` to GET and PUT; a non-numeric
 * or out-of-range `:id` is 400. Signed-out writes are 401 UNAUTHENTICATED before the body is
 * checked. Failures use the error envelope. Every response is `Cache-Control: no-store`: GET
 * differs per viewer (`mine`), and a write shows at once in the list and the app's aggregates.
 */
export function createReviewsRouter({ db }: { db: Pool }): Router {
  // mergeParams: the app id is in the mount path, `/api/apps/:id/reviews`.
  const router = Router({ mergeParams: true });

  router.get(
    "/",
    noStore,
    validate(appIdParamsSchema, "params"),
    validate(listReviewsQuerySchema, "query"),
    optionalAuth(db),
    async (req, res) => {
      const { id }: AppIdParams = res.locals.params;
      const { page }: ListReviewsQuery = res.locals.query;
      const reviews = await listReviews(db, id, page, req.user?.id ?? null);
      if (!reviews) throw new HttpError(404, "NOT_FOUND", "App not found.");
      res.status(200).json(reviews);
    },
  );

  router.put(
    "/",
    noStore,
    requireAuth(db),
    validate(appIdParamsSchema, "params"),
    validate(putReviewSchema, "body"),
    async (req, res) => {
      const { id }: AppIdParams = res.locals.params;
      const { rating, comment }: PutReviewInput = req.body;
      const userId = callerId(req);
      const review = await upsertReview(db, { appId: id, userId, rating, comment });
      if (review) {
        res.status(200).json(review);
        return;
      }
      // Nothing written: tell a missing app from the developer's own.
      if ((await findAppDeveloperId(db, id)) === userId) {
        throw new HttpError(403, "FORBIDDEN", "You can't review your own app.");
      }
      throw new HttpError(404, "NOT_FOUND", "App not found.");
    },
  );

  router.delete(
    "/",
    noStore,
    requireAuth(db),
    validate(appIdParamsSchema, "params"),
    async (req, res) => {
      const { id }: AppIdParams = res.locals.params;
      if (!(await deleteReview(db, id, callerId(req)))) {
        throw new HttpError(404, "NOT_FOUND", "Review not found.");
      }
      res.status(204).end();
    },
  );

  return router;
}
