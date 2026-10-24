import { z } from "zod";
import { MAX_PAGE } from "../apps/apps.schemas.js";

// Review limits. Phase 10's client mirrors these.

/** Reviews per page of `GET /api/apps/:id/reviews`. Fixed: the client can't choose it. */
export const REVIEWS_PAGE_SIZE = 20;
/**
 * After trimming, in UTF-16 units: `String.length`, as an HTML `maxlength` counts. Not zod's
 * `.max()`, which counts code points, so an emoji-heavy comment could pass it and fail the client.
 */
export const MAX_COMMENT_LENGTH = 2000;

// Postgres can't store NUL (a 500, not a 400). A comment is multi-line text, so newlines and other
// control characters stay. Redeclared rather than exported from apps.schemas.ts, which is Phase 5's.
const NUL = /\u0000/;

/**
 * `PUT /api/apps/:id/reviews`: the whole review, so leaving `comment` out clears it. `rating` must
 * already be a JSON integer ("5" and 4.5 are 400s). `comment` comes out trimmed, and null when it
 * is missing, null or blank. Unknown keys such as `user_id` and `app_id` are dropped: the reviewer
 * comes only from the session and the app only from the URL.
 */
export const putReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .refine(
      (text) => text.length <= MAX_COMMENT_LENGTH,
      `Must be at most ${MAX_COMMENT_LENGTH} characters`,
    )
    .refine((text) => !NUL.test(text), "Must not contain NUL characters")
    .nullish()
    .transform((text) => text || null),
});
export type PutReviewInput = z.infer<typeof putReviewSchema>;

// A repeated parameter (?page=1&page=2) arrives as an array, which coerces to NaN: a 400.
/** `GET /api/apps/:id/reviews`. */
export const listReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
