import type { RequestHandler } from "express";
import type { z } from "zod";

export type RequestPart = "body" | "query" | "params";

/**
 * Parses one part of the request with `schema`. A failure throws the ZodError, which the error
 * handler turns into 400 VALIDATION_ERROR with per-field details.
 *
 * Where the parsed (trimmed, defaulted, coerced) value ends up:
 * - `body`   → replaces `req.body`.
 * - `query`  → `res.locals.query`. Express 5's `req.query` is a getter, so assigning it throws.
 * - `params` → `res.locals.params`. Express rebuilds `req.params` for every matching layer.
 * Handlers read the parsed value from there, never the raw `req.query`/`req.params`, and annotate
 * it with the schema's type: `const q: SearchQuery = res.locals.query`.
 */
export function validate(schema: z.ZodType, part: RequestPart): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.parse(req[part]);
    if (part === "body") req.body = parsed;
    else res.locals[part] = parsed;
    next();
  };
}
