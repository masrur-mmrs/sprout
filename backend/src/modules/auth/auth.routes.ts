import { Router, type Request } from "express";
import { rateLimit } from "express-rate-limit";
import type { Pool } from "pg";
import { HttpError } from "../../lib/errors.js";
import { endSession, startSession } from "../../lib/session.js";
import { validate } from "../../lib/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import type { EmailSender } from "../../services/email/emailSender.js";
import {
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from "./auth.schemas.js";
import {
  getDummyHash,
  requestPasswordReset,
  resetPassword,
  signIn,
  signUp,
} from "./auth.service.js";

const FORGOT_PASSWORD_MESSAGE = "If an account exists, a reset link has been sent.";
const RESET_PASSWORD_MESSAGE = "Your password has been reset. Sign in with your new password.";

interface LimitOptions {
  windowMs: number;
  limit: number;
  message: string;
  /** Defaults to the client IP (req.ip, which depends on app's `trust proxy`). */
  keyGenerator?: (req: Request) => string;
  /**
   * `false` sends no RateLimit or Retry-After headers. Use it when the key isn't the caller: the
   * counter would show anyone what other clients did with that key.
   */
  headers?: boolean;
}

/** 10 requests per minute per client IP: signup, signin and reset. */
const PER_MINUTE: LimitOptions = {
  windowMs: 60_000,
  limit: 10,
  message: "Too many attempts. Try again in a minute.",
};

/** 3 forgot-password requests per 15 minutes, per IP and per email. */
const FORGOT_REQUESTS: LimitOptions = {
  windowMs: 15 * 60_000,
  limit: 3,
  message: "Too many reset requests. Try again in 15 minutes.",
};

function authRateLimiter({ windowMs, limit, message, keyGenerator, headers = true }: LimitOptions) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator,
    standardHeaders: headers ? "draft-8" : false,
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, "RATE_LIMITED", message));
    },
  });
}

/** Swallowed but logged: the stack only, which never carries the email, token or reset URL. */
function logResetRequestFailure(err: unknown): void {
  const trace = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`Password reset request failed: ${trace}`);
}

/**
 * `/api/auth/*`. The contract, mirrored by the frontend's `lib/api/types.ts`:
 *
 * - `POST /signup` `{ username, email, password, role? }` → 201 `PublicUser`, sets the cookie.
 * - `POST /signin` `{ email, password }` → 200 `PublicUser`, sets the cookie.
 * - `POST /signout` → 204, clears the cookie.
 * - `GET /me` → 200 `PublicUser`, or 401 UNAUTHENTICATED.
 * - `POST /forgot-password` `{ email }` → 200 `{ message }`, always the same bytes for a known or
 *   unknown email. The reset email (if any) is sent after the response. 429 RATE_LIMITED after 3
 *   requests in 15 minutes from one IP or for one email.
 * - `POST /reset-password` `{ token, password }` → 200 `{ message }`. 400 INVALID_OR_EXPIRED_TOKEN
 *   for an unknown, used or expired token; 400 VALIDATION_ERROR for a malformed token (not 64
 *   lower-case hex) or a password that breaks the signup rules. Sets no cookie: the frontend sends
 *   the user to signin. A success revokes every other reset link the user has.
 *
 * `PublicUser` is `{ id: number, username: string, email: string, role: "developer" | "user" }`
 * in all three responses. Failures use the error envelope.
 */
export function createAuthRouter({ db, email }: { db: Pool; email: EmailSender }): Router {
  const router = Router();
  // Built per app, not at module scope, so each createApp() (and each test) counts from zero.
  const signUpLimiter = authRateLimiter(PER_MINUTE);
  const signInLimiter = authRateLimiter(PER_MINUTE);
  const resetLimiter = authRateLimiter(PER_MINUTE);
  const forgotIpLimiter = authRateLimiter(FORGOT_REQUESTS);
  // Runs after validate, so the key is the trimmed, lower-cased email: case variants share it.
  // Unknown emails are counted exactly like known ones. Headerless: its counter would tell anyone
  // how often, and when, someone asked for a reset for that address.
  const forgotEmailLimiter = authRateLimiter({
    ...FORGOT_REQUESTS,
    keyGenerator: (req) => (req.body as ForgotPasswordInput).email,
    headers: false,
  });
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

  router.post(
    "/forgot-password",
    forgotIpLimiter,
    validate(forgotPasswordSchema, "body"),
    forgotEmailLimiter,
    (req, res) => {
      const input: ForgotPasswordInput = req.body;
      // Answer before the lookup: the bytes and timing can't depend on whether the account exists,
      // and a Resend failure can't reach the client. The work continues after the response.
      res.status(200).json({ message: FORGOT_PASSWORD_MESSAGE });
      void requestPasswordReset(db, email, input.email).catch(logResetRequestFailure);
    },
  );

  router.post(
    "/reset-password",
    resetLimiter,
    validate(resetPasswordSchema, "body"),
    async (req, res) => {
      const input: ResetPasswordInput = req.body;
      await resetPassword(db, input);
      res.status(200).json({ message: RESET_PASSWORD_MESSAGE });
    },
  );

  return router;
}
