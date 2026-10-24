import bcrypt from "bcrypt";
import type { Queryable } from "../../db/pool.js";
import { HttpError } from "../../lib/errors.js";
import { findUserByEmail, insertUser, type PublicUser } from "./auth.queries.js";
import { MAX_PASSWORD_BYTES, type SignInInput, type SignUpInput } from "./auth.schemas.js";

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
