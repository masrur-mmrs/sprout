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
