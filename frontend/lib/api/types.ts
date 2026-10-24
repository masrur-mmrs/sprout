/**
 * The backend's response contract (backend/src/**), read side only. Request bodies belong to the
 * phases that send them. Timestamps arrive as ISO 8601 strings. `file_url`, `password_hash` and
 * `token_hash` never leave the backend, so they have no place here.
 */

/** The httpOnly session cookie (INV-6). JS never reads its value; the server only forwards it. */
export const SESSION_COOKIE = "sprout_session";

/** Every `error.code` the API sends (backend/src/lib/errors.ts). */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "INVALID_OR_EXPIRED_TOKEN",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Field name → messages, e.g. `{ email: ["Invalid email address"] }`. */
export type ErrorDetails = Record<string, string[]>;

/** The one shape every non-2xx response uses. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetails };
}

/** `GET /api/auth/me`, signin and signup (the backend's `PublicUser`). */
export interface User {
  id: number;
  username: string;
  email: string;
  role: "developer" | "user";
}

/** The fixed category list, in display order (backend/src/modules/apps/categories.ts). */
export const CATEGORIES = [
  "Productivity",
  "Developer Tools",
  "Games",
  "Design",
  "Utilities",
  "Education",
  "Music & Audio",
  "Photo & Video",
  "Social",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface PublicApp {
  id: number;
  developer_id: number;
  title: string;
  tagline: string;
  description: string;
  category: Category;
  version: string;
  icon_url: string | null;
  download_count: number;
  created_at: string;
  updated_at: string;
}

/** A PublicApp with its review aggregate. `avg_rating` is null for an app with no reviews. */
export interface DeveloperApp extends PublicApp {
  avg_rating: number | null;
  review_count: number;
}

/** The detail page's app, naming its developer by username only. */
export interface AppDetail extends DeveloperApp {
  developer_username: string;
}

/** A browse or search card. `avg_rating` is null for an app with no reviews. */
export interface AppSummary {
  id: number;
  title: string;
  tagline: string;
  category: Category;
  icon_url: string | null;
  download_count: number;
  avg_rating: number | null;
  review_count: number;
}

export interface SearchResult extends AppSummary {
  match_score: number;
}

export interface AppPage {
  items: AppSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Review {
  id: number;
  username: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface ReviewPage {
  items: Review[];
  page: number;
  pageSize: number;
  total: number;
  /** The viewer's own review (also somewhere in the full list), or null. */
  mine: Review | null;
}
