import type { Request, RequestHandler } from "express";
import type { Queryable } from "../db/pool.js";
import { HttpError } from "../lib/errors.js";
import { readSession, SESSION_COOKIE } from "../lib/session.js";
import { findUserById, type PublicUser } from "../modules/auth/auth.queries.js";
import type { Role } from "../modules/auth/auth.schemas.js";

/**
 * The signed-in user, re-loaded from the database on every request so a role change or a deleted
 * account takes effect immediately. Null for a missing, invalid or expired token or a deleted user.
 * Database errors still throw (500): an outage is not "signed out".
 */
async function loadSessionUser(db: Queryable, req: Request): Promise<PublicUser | null> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token === "") return null;
  const userId = await readSession(token);
  return userId === null ? null : findUserById(db, userId);
}

/** 401 UNAUTHENTICATED unless the request has a valid session; sets `req.user`. */
export function requireAuth(db: Queryable): RequestHandler {
  return async (req, _res, next) => {
    const user = await loadSessionUser(db, req);
    if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
    req.user = user;
    next();
  };
}

/** Like requireAuth, but an anonymous request continues without `req.user` instead of a 401. */
export function optionalAuth(db: Queryable): RequestHandler {
  return async (req, _res, next) => {
    const user = await loadSessionUser(db, req);
    if (user) req.user = user;
    next();
  };
}

/** 403 FORBIDDEN unless `req.user` has `role`. Mount after requireAuth. */
export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, "UNAUTHENTICATED", "Sign in to continue."));
    if (req.user.role !== role) return next(new HttpError(403, "FORBIDDEN", "Not allowed."));
    next();
  };
}
