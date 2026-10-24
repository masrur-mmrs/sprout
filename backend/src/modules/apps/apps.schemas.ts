import { z } from "zod";
import { CATEGORIES } from "./categories.js";

// Upload limits and allow-lists. Phase 11's client-side checks mirror these.

/** 500 MiB, enforced by GCS through the signed `x-goog-content-length-range`. */
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
/**
 * Binaries are signed as this type whatever the client says: browsers report "" for .AppImage,
 * .deb and .pkg, so their type can't be required.
 */
export const BINARY_CONTENT_TYPE = "application/octet-stream";
/** No SVG: it can carry scripts, and the icons bucket is public. */
export const ICON_CONTENT_TYPES = ["image/png", "image/webp", "image/jpeg"] as const;
export type IconContentType = (typeof ICON_CONTENT_TYPES)[number];
/** The file extensions each icon type may have, matched case-insensitively. */
export const ICON_EXTENSIONS: Record<IconContentType, readonly string[]> = {
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/jpeg": [".jpg", ".jpeg"],
};

// Text limits: the apps column sizes (001_init.sql), plus a cap on the TEXT description.
export const MAX_TITLE_LENGTH = 100;
export const MAX_TAGLINE_LENGTH = 255;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_VERSION_LENGTH = 20;

const MAX_FILENAME_LENGTH = 100;
const MAX_INT4 = 2_147_483_647;
const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/**
 * Exactly the keys `POST /api/apps/uploads` issues: `uploads/{userId}/{randomUUID()}/{filename}`,
 * where the filename is an `uploadFilename` result. Group 1 is the uploader's id.
 */
const UPLOAD_KEY = new RegExp(
  `^uploads/([1-9][0-9]{0,9})/${UUID_V4}/[A-Za-z0-9_][A-Za-z0-9._-]{0,${MAX_FILENAME_LENGTH - 1}}$`,
);

/** The id in an issued key's prefix, or null if `key` isn't an issued key. */
export function uploadKeyOwner(key: string): number | null {
  const owner = UPLOAD_KEY.exec(key)?.[1];
  return owner === undefined ? null : Number(owner);
}

/**
 * Only `[A-Za-z0-9._-]`: each run of other characters becomes one "-", and leading dots and dashes
 * go, so the name is safe in an object key, a URL and a Content-Disposition header.
 */
export function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "");
}

/**
 * The basename of a client's file name, made safe and cut to 100 characters. The stem and the
 * extension are handled apart, so the extension survives both, and a stem with no safe characters
 * left ("日本.zip", ".zip") becomes "file".
 */
export function uploadFilename(raw: string): string {
  const base = raw.slice(Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\")) + 1);
  const dot = base.lastIndexOf(".");
  const split = dot >= 0 && /^\.[A-Za-z0-9]{1,9}$/.test(base.slice(dot));
  const extension = split ? base.slice(dot) : "";
  const stem = safeFilename(split ? base.slice(0, dot) : base) || "file";
  return stem.slice(0, MAX_FILENAME_LENGTH - extension.length) + extension;
}

function hasExtension(name: string, extensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension.toLowerCase()));
}

const filenameSchema = z.string().min(1).max(255).transform(uploadFilename);

const binaryUploadSchema = z.object({
  kind: z.literal("binary"),
  filename: filenameSchema.refine((name) => hasExtension(name, BINARY_EXTENSIONS), {
    message: `Must end in ${BINARY_EXTENSIONS.join(", ")}`,
  }),
  // Accepted but never used: see BINARY_CONTENT_TYPE.
  contentType: z.string().max(255),
  size: z.number().int().min(1).max(MAX_BINARY_BYTES, "Must be at most 500 MiB"),
});

const iconUploadSchema = z
  .object({
    kind: z.literal("icon"),
    filename: filenameSchema,
    contentType: z.enum(ICON_CONTENT_TYPES, {
      error: "Must be image/png, image/webp or image/jpeg",
    }),
    size: z.number().int().min(1).max(MAX_ICON_BYTES, "Must be at most 1 MiB"),
  })
  .refine(({ filename, contentType }) => hasExtension(filename, ICON_EXTENSIONS[contentType]), {
    path: ["filename"],
    message: "The extension must match the image type",
  });

/** `POST /api/apps/uploads`. `filename` comes out sanitized, ready to be the key's last segment. */
export const uploadRequestSchema = z.discriminatedUnion("kind", [
  binaryUploadSchema,
  iconUploadSchema,
]);
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

// Postgres can't store NUL (a 500, not a 400). One-line display text also bars every other control
// character and the bidi controls that make a title render differently from what it says.
const NUL = /\u0000/;
const UNSAFE_IN_LINE = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const textSchema = (max: number, disallowed: RegExp) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !disallowed.test(text), "Must not contain control characters");
const keySchema = z.string().regex(UPLOAD_KEY, "Must be a key from POST /api/apps/uploads");

export const createAppSchema = z.object({
  title: textSchema(MAX_TITLE_LENGTH, UNSAFE_IN_LINE),
  tagline: textSchema(MAX_TAGLINE_LENGTH, UNSAFE_IN_LINE),
  description: textSchema(MAX_DESCRIPTION_LENGTH, NUL),
  category: z.enum(CATEGORIES),
  version: z
    .string()
    .trim()
    .max(MAX_VERSION_LENGTH)
    .regex(/^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/, "Use a version like 1.2 or 2.0.1-beta.1"),
  binaryKey: keySchema,
  iconKey: keySchema.optional(),
});
export type CreateAppInput = z.infer<typeof createAppSchema>;

/** Any subset of the create fields, but at least one. An icon can be replaced, not removed. */
export const updateAppSchema = createAppSchema
  .partial()
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Change at least one field.",
  });
export type UpdateAppInput = z.infer<typeof updateAppSchema>;

/** `:id`. The max keeps an out-of-range id a 400 instead of pg error 22003 (a 500). */
export const appIdParamsSchema = z.object({
  id: z.coerce.number().int().min(1).max(MAX_INT4),
});
export type AppIdParams = z.infer<typeof appIdParamsSchema>;
