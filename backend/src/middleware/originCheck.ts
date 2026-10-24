import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../lib/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defense in depth on top of SameSite=Lax: a state-changing request that carries an Origin
 * header must come from the frontend. Requests without one (curl, same-origin GETs) pass.
 */
export const originCheck: RequestHandler = (req, _res, next) => {
  const origin = req.get("origin");
  if (SAFE_METHODS.has(req.method) || origin === undefined || origin === env.APP_URL) return next();
  next(new HttpError(403, "FORBIDDEN", "Cross-origin request rejected."));
};
