import type { PublicUser } from "../modules/auth/auth.queries.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth (always) and optionalAuth (when signed in), fresh from the database. */
      user?: PublicUser;
    }
  }
}

export {};
