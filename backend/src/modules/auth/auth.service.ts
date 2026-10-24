import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { Pool } from "pg";
import { env } from "../../config/env.js";
import { withTransaction, type Queryable } from "../../db/pool.js";
import { HttpError } from "../../lib/errors.js";
import type { EmailSender } from "../../services/email/emailSender.js";
import {
  consumePasswordReset,
  deletePasswordResets,
  findUserByEmail,
  hasValidPasswordReset,
  insertPasswordReset,
  insertUser,
  lockUserForReset,
  updatePasswordHash,
  type PublicUser,
} from "./auth.queries.js";
import {
  MAX_PASSWORD_BYTES,
  type ResetPasswordInput,
  type SignInInput,
  type SignUpInput,
} from "./auth.schemas.js";

const BCRYPT_COST = 12;

let dummyHash: Promise<string> | undefined;

/**
 * A real cost-12 hash, computed once per process, that signin compares against when the email is
 * unknown. That keeps unknown-email and wrong-password signins equally slow. The auth router calls
 * this at startup so even the first unknown-email signin doesn't pay for computing it.
 */
export function getDummyHash(): Promise<string> {
  if (!dummyHash) {
    dummyHash = bcrypt.hash("sprout-timing-equalizer", BCRYPT_COST);
    // Don't cache a failure: the next signin retries.
    dummyHash.catch(() => {
      dummyHash = undefined;
    });
  }
  return dummyHash;
}

/** Creates the account. A taken email or username surfaces as pg 23505 → 409 CONFLICT. */
export async function signUp(db: Queryable, input: SignUpInput): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  return insertUser(db, {
    username: input.username,
    email: input.email,
    passwordHash,
    role: input.role,
  });
}

/** Every failure is the same 401, so the response never says whether the email exists. */
export async function signIn(db: Queryable, input: SignInInput): Promise<PublicUser> {
  const user = await findUserByEmail(db, input.email);
  const matches = await bcrypt.compare(
    input.password,
    user?.password_hash ?? (await getDummyHash()),
  );
  // bcrypt ignores bytes past 72, so a longer password would match the stored one's prefix.
  const tooLong = Buffer.byteLength(input.password, "utf8") > MAX_PASSWORD_BYTES;
  if (!user || !matches || tooLong) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  }
  return { id: user.id, username: user.username, email: user.email, role: user.role };
}

/** sha256 of a raw reset token, as hex: the only form the database ever sees (G3, INV-4). */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Blueprint §6 steps 2–4. The route has already answered the client by the time this runs, so it
 * can do different work for known and unknown emails without the response showing it. An unknown
 * email does nothing. A known one gets a fresh token, which revokes every earlier link, then the
 * email, sent only after the token is committed. A rejection must be logged without the error's
 * details (see the route).
 */
export async function requestPasswordReset(
  db: Pool,
  sender: EmailSender,
  email: string,
): Promise<void> {
  const user = await findUserByEmail(db, email);
  if (!user) return;

  const token = randomBytes(32).toString("hex");
  await withTransaction(async (client) => {
    await lockUserForReset(client, user.id);
    await deletePasswordResets(client, user.id);
    await insertPasswordReset(client, user.id, hashResetToken(token));
  }, db);

  // From env.APP_URL only, never the request's Host header, which an attacker could point elsewhere.
  const resetUrl = `${env.APP_URL}/reset-password?token=${token}`;
  await sender.sendPasswordReset({ to: user.email, username: user.username, resetUrl });
}

function invalidResetToken(): HttpError {
  return new HttpError(
    400,
    "INVALID_OR_EXPIRED_TOKEN",
    "This reset link is invalid or has expired. Request a new one.",
  );
}

/**
 * Blueprint §6 step 5. Sets the new password and revokes every reset link the user has. The
 * token is consumed inside the transaction, so it works exactly once even under concurrent
 * requests. Existing sessions are not ended, and the user is not signed in.
 */
export async function resetPassword(db: Pool, input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashResetToken(input.token);
  // Check first so a bad or expired token never costs a bcrypt hash.
  if (!(await hasValidPasswordReset(db, tokenHash))) throw invalidResetToken();

  // Hashed outside the transaction: holding row locks for ~250 ms of bcrypt would block others.
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  await withTransaction(async (client) => {
    const userId = await consumePasswordReset(client, tokenHash);
    // A concurrent reset with the same token won, or the token expired during the hash.
    if (userId === null) throw invalidResetToken();
    await updatePasswordHash(client, userId, passwordHash);
    await deletePasswordResets(client, userId);
  }, db);
}
