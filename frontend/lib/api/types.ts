/**
 * The backend's response contract (backend/src/**), plus the request bodies the frontend sends,
 * each added by the phase that sends it. Timestamps arrive as ISO 8601 strings. `file_url`,
 * `password_hash` and `token_hash` never leave the backend, so they have no place here.
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

/** `POST /api/auth/signup`. `role` defaults to "user". */
export interface SignUpBody {
  username: string;
  email: string;
  password: string;
  role?: User["role"];
}

/** `POST /api/auth/signin`. */
export interface SignInBody {
  email: string;
  password: string;
}

/** `POST /api/auth/forgot-password`. */
export interface ForgotPasswordBody {
  email: string;
}

/** `POST /api/auth/reset-password`. The token travels only in this body, never in another URL. */
export interface ResetPasswordBody {
  token: string;
  password: string;
}

/** forgot-password's and reset-password's 200: text to show as-is. */
export interface MessageResponse {
  message: string;
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

/** `GET /api/apps?sort=`: most downloaded (the default), newest, or highest rated. */
export const APP_SORTS = ["popular", "new", "top-rated"] as const;

export type AppSort = (typeof APP_SORTS)[number];

// Limits mirrored from backend/src/modules/{apps/apps,reviews/reviews}.schemas.ts. Lengths count
// UTF-16 units (`String.length`), as the backend and an HTML `maxlength` do.
/** The highest `page` the browse and review lists accept. */
export const MAX_PAGE = 1000;
/** A search `q`, after trimming. */
export const MAX_SEARCH_LENGTH = 100;
/** A review comment, after trimming. */
export const MAX_COMMENT_LENGTH = 2000;

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

/**
 * `PUT /api/apps/:id/reviews`: the whole review, creating or replacing it. `rating` is an integer
 * from 1 to 5 (a number, never a string); leaving `comment` out, or sending null, clears it.
 */
export interface PutReviewBody {
  rating: number;
  comment?: string | null;
}

// Publishing limits and allow-lists, mirrored from backend/src/modules/apps/apps.schemas.ts and
// checked by lib/app-validation.ts before any upload starts. Lengths count UTF-16 units.
export const MAX_TITLE_LENGTH = 100;
export const MAX_TAGLINE_LENGTH = 255;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_VERSION_LENGTH = 20;
/** 500 MiB, enforced by storage through the signed length range. */
export const MAX_BINARY_BYTES = 500 * 1024 * 1024;
/** 1 MiB. */
export const MAX_ICON_BYTES = 1024 * 1024;
/** Matched case-insensitively, so `.ZIP` and `.appimage` pass too. */
export const BINARY_EXTENSIONS = [
  ".zip",
  ".dmg",
  ".apk",
  ".exe",
  ".msi",
  ".pkg",
  ".deb",
  ".AppImage",
] as const;
/** No SVG: it can carry scripts, and the icons bucket is public. */
export const ICON_CONTENT_TYPES = ["image/png", "image/webp", "image/jpeg"] as const;

export type IconContentType = (typeof ICON_CONTENT_TYPES)[number];

/** The file extensions each icon type may have, matched case-insensitively. */
export const ICON_EXTENSIONS: Record<IconContentType, readonly string[]> = {
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/jpeg": [".jpg", ".jpeg"],
};

export type UploadKind = "binary" | "icon";

/** `POST /api/apps/uploads`. A binary's `contentType` is ignored: it's stored as octet-stream. */
export interface UploadRequestBody {
  kind: UploadKind;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * `POST /api/apps/uploads`'s 200. `uploadUrl` is a bearer credential for 15 minutes: PUT the file
 * to it with exactly `headers`, and never log, render or store it. `key` is opaque; send it back
 * as is.
 */
export interface UploadUrlResponse {
  uploadUrl: string;
  key: string;
  headers: Record<string, string>;
}

/** `POST /api/apps` → 201 PublicApp. The backend trims the text; the keys come from /uploads. */
export interface CreateAppBody {
  title: string;
  tagline: string;
  description: string;
  category: Category;
  version: string;
  binaryKey: string;
  iconKey?: string;
}

/** `PATCH /api/apps/:id` → 200 PublicApp: any non-empty subset. An icon can't be removed. */
export type UpdateAppBody = Partial<CreateAppBody>;
