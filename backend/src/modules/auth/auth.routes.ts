import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Queryable } from "../../db/pool.js";
import { HttpError } from "../../lib/errors.js";
import { endSession, startSession } from "../../lib/session.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { signInSchema, signUpSchema, type SignInInput, type SignUpInput } from "./auth.schemas.js";
import { getDummyHash, signIn, signUp } from "./auth.service.js";

/** 10 requests per minute per client IP (req.ip, which depends on app's `trust proxy`). */
function authRateLimiter() {
  return rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, "RATE_LIMITED", "Too many attempts. Try again in a minute."));
    },
  });
}

/**
 * `/api/auth/*`. The `/me` contract, mirrored by the frontend's `lib/api/types.ts`:
 *
 * - `POST /signup` `{ username, email, password, role? }` → 201 `PublicUser`, sets the cookie.
 * - `POST /signin` `{ email, password }` → 200 `PublicUser`, sets the cookie.
 * - `POST /signout` → 204, clears the cookie.
 * - `GET /me` → 200 `PublicUser`, or 401 UNAUTHENTICATED.
 *
 * `PublicUser` is `{ id: number, username: string, email: string, role: "developer" | "user" }`
 * in all three responses. Failures use the error envelope.
 */
export function createAuthRouter(db: Queryable): Router {
  const router = Router();
  // Built per app, not at module scope, so each createApp() (and each test) counts from zero.
  const signUpLimiter = authRateLimiter();
  const signInLimiter = authRateLimiter();
  void getDummyHash();

  // Responses carry the session cookie or personal data: no cache may keep them.
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/signup", signUpLimiter, validate(signUpSchema, "body"), async (req, res) => {
    const input: SignUpInput = req.body;
    const user = await signUp(db, input);
    await startSession(res, user);
    res.status(201).json(user);
  });

  router.post("/signin", signInLimiter, validate(signInSchema, "body"), async (req, res) => {
    const input: SignInInput = req.body;
    const user = await signIn(db, input);
    await startSession(res, user);
    res.status(200).json(user);
  });

  router.post("/signout", (_req, res) => {
    endSession(res);
    res.status(204).end();
  });

  router.get("/me", requireAuth(db), (req, res) => {
    res.status(200).json(req.user);
  });

  return router;
}
