import type { Queryable } from "../../db/pool.js";
import type { Role } from "./auth.schemas.js";

/** The only user shape that leaves the backend: no password_hash, no created_at. */
export interface PublicUser {
  id: number;
  username: string;
  email: string;
  role: Role;
}

/** Signin's lookup also needs the hash. Never send this row; map it to PublicUser first. */
export interface UserWithHash extends PublicUser {
  password_hash: string;
}

/** Blueprint §5 Sign Up query, verbatim. A duplicate email or username raises pg 23505. */
export async function insertUser(
  db: Queryable,
  user: { username: string; email: string; passwordHash: string; role: Role },
): Promise<PublicUser> {
  const { rows } = await db.query<PublicUser>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, email, role`,
    [user.username, user.email, user.passwordHash, user.role],
  );
  if (!rows[0]) throw new Error("INSERT INTO users returned no row");
  return rows[0];
}

/** `email` must already be trimmed and lower-cased (G10); the schemas do that. */
export async function findUserByEmail(db: Queryable, email: string): Promise<UserWithHash | null> {
  const { rows } = await db.query<UserWithHash>(
    "SELECT id, username, email, role, password_hash FROM users WHERE email = $1",
    [email],
  );
  return rows[0] ?? null;
}

export async function findUserById(db: Queryable, id: number): Promise<PublicUser | null> {
  const { rows } = await db.query<PublicUser>(
    "SELECT id, username, email, role FROM users WHERE id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function updatePasswordHash(
  db: Queryable,
  userId: number,
  passwordHash: string,
): Promise<void> {
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

// Password resets. Rows are looked up by sha256(token) only (G3): the raw token is never a parameter.

/**
 * Locks the user's row until the transaction ends. Issuing a token takes it first, so concurrent
 * requests for one user run one after another; otherwise each one's DELETE misses the other's
 * uncommitted INSERT, and two live tokens remain.
 */
export async function lockUserForReset(db: Queryable, userId: number): Promise<void> {
  await db.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
}

/** Removes all of the user's reset rows: a new link or a completed reset revokes every older one. */
export async function deletePasswordResets(db: Queryable, userId: number): Promise<void> {
  await db.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
}

/** Blueprint §5 Forgot Password Token Insertion with the G3 column: `$2` is sha256(token). */
export async function insertPasswordReset(
  db: Queryable,
  userId: number,
  tokenHash: string,
): Promise<void> {
  await db.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [userId, tokenHash],
  );
}

/** Whether an unexpired reset row has this hash. Read-only: the token is not consumed. */
export async function hasValidPasswordReset(db: Queryable, tokenHash: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT user_id FROM password_resets WHERE token_hash = $1 AND expires_at > NOW()",
    [tokenHash],
  );
  return rows.length > 0;
}

/**
 * Deletes the unexpired reset row with this hash and returns its user id, or null if none exists.
 * When two resets race on one token, the row lock picks a single winner: the second DELETE waits
 * for the first transaction to commit, then finds no row.
 */
export async function consumePasswordReset(
  db: Queryable,
  tokenHash: string,
): Promise<number | null> {
  const { rows } = await db.query<{ user_id: number }>(
    `DELETE FROM password_resets
     WHERE token_hash = $1 AND expires_at > NOW()
     RETURNING user_id`,
    [tokenHash],
  );
  return rows[0]?.user_id ?? null;
}
