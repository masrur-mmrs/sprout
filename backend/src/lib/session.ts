import type { CookieOptions, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../config/env.js";

export const SESSION_COOKIE = "sprout_session";

const SESSION_TTL = "7d";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SERIAL = 2_147_483_647;
const secret = new TextEncoder().encode(env.JWT_SECRET);

// First-party behind the Next.js rewrite (G1), so Lax is enough and JS can never read it (INV-6).
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

/** Signs a 7-day HS256 JWT `{ sub, role }` and sets it as the session cookie. */
export async function startSession(
  res: Response,
  user: { id: number; role: string },
): Promise<void> {
  const token = await new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secret);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
}

/** Expires the session cookie. The attributes must match the ones it was set with. */
export function endSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}

/**
 * Returns the user id a valid, unexpired session token belongs to, or null for any bad token.
 * The `role` claim is ignored: callers re-load the user so role and deletion are never stale.
 */
export async function readSession(token: string): Promise<number | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      // Every session token has these; anything else signed with JWT_SECRET is not a session.
      requiredClaims: ["sub", "iat", "exp"],
    });
    if (typeof payload.sub !== "string" || !/^[1-9]\d*$/.test(payload.sub)) return null;
    const id = Number(payload.sub);
    // users.id is SERIAL (int4): a larger value would make the lookup throw instead of miss.
    return id <= MAX_SERIAL ? id : null;
  } catch {
    return null;
  }
}
