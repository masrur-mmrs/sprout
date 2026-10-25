import {
  BINARY_EXTENSIONS,
  CATEGORIES,
  ICON_CONTENT_TYPES,
  ICON_EXTENSIONS,
  MAX_BINARY_BYTES,
  MAX_DESCRIPTION_LENGTH,
  MAX_ICON_BYTES,
  MAX_TAGLINE_LENGTH,
  MAX_TITLE_LENGTH,
  MAX_VERSION_LENGTH,
  type IconContentType,
} from "./api/types";
import { formatCount } from "./format";

/**
 * The app form's checks: the backend's rules (backend/src/modules/apps/apps.schemas.ts), run
 * before any upload starts. The backend checks the text only after the uploads, so a bad title
 * caught there would waste a 500 MB upload. Every message says what to do.
 */

/** The form's text, as typed. */
export interface AppText {
  title: string;
  tagline: string;
  description: string;
  category: string;
  version: string;
}

export type AppTextField = keyof AppText;

/** The parts of a File the checks read. */
export interface FileFacts {
  name: string;
  size: number;
  type: string;
}

// Postgres can't store NUL. One-line text also bars every other control character (tabs and
// newlines too) and the bidi controls that make a title render differently from what it says.
const NUL = /\u0000/;
const UNSAFE_IN_LINE = /[\p{Cc}\u202A-\u202E\u2066-\u2069]/u;
const VERSION = /^\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/;
/** /uploads' `filename`, counted before the backend sanitizes it into the key. */
const MAX_FILENAME_LENGTH = 255;

const VERSION_MESSAGE = "Use a version like 1.2 or 2.0.1-beta.1.";

/** Trimmed, non-empty, at most `max` UTF-16 units, without `disallowed`. */
function checkText(raw: string, max: number, empty: string, disallowed: RegExp, bad: string) {
  const text = raw.trim();
  if (text === "") return empty;
  if (text.length > max) return `Use at most ${formatCount(max)} characters.`;
  if (disallowed.test(text)) return bad;
  return null;
}

function checkVersion(raw: string) {
  const version = raw.trim();
  if (version === "") return "Enter a version, like 1.2.";
  if (version.length > MAX_VERSION_LENGTH) return `Use at most ${MAX_VERSION_LENGTH} characters.`;
  return VERSION.test(version) ? null : VERSION_MESSAGE;
}

/** Each field's first problem, or nothing for a field that passes. */
export function validateAppText(values: AppText): Partial<Record<AppTextField, string[]>> {
  const controls = "Remove tabs and other invisible control characters.";
  const found: Record<AppTextField, string | null> = {
    title: checkText(values.title, MAX_TITLE_LENGTH, "Enter a title.", UNSAFE_IN_LINE, controls),
    tagline: checkText(
      values.tagline,
      MAX_TAGLINE_LENGTH,
      "Enter a tagline.",
      UNSAFE_IN_LINE,
      controls,
    ),
    description: checkText(
      values.description,
      MAX_DESCRIPTION_LENGTH,
      "Enter a description.",
      NUL,
      "Remove the invisible NUL characters.",
    ),
    category: (CATEGORIES as readonly string[]).includes(values.category)
      ? null
      : "Choose a category.",
    version: checkVersion(values.version),
  };
  const errors: Partial<Record<AppTextField, string[]>> = {};
  for (const [field, message] of Object.entries(found)) {
    if (message) errors[field as AppTextField] = [message];
  }
  return errors;
}

function hasExtension(name: string, extensions: readonly string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((extension) => lower.endsWith(extension.toLowerCase()));
}

function checkFile(file: FileFacts, maxBytes: number, tooBig: string) {
  if (file.name.length > MAX_FILENAME_LENGTH) {
    return `Rename the file to ${MAX_FILENAME_LENGTH} characters or fewer.`;
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1) return "The file is empty.";
  if (file.size > maxBytes) return tooBig;
  return null;
}

/** The binary people download: an allowed extension in any case, 1 byte to 500 MiB. */
export function validateBinary(file: FileFacts): string | null {
  if (!hasExtension(file.name, BINARY_EXTENSIONS)) {
    return "Choose a .zip, .dmg, .apk, .exe, .msi, .pkg, .deb or .AppImage file.";
  }
  return checkFile(file, MAX_BINARY_BYTES, "Binaries can be at most 500 MB.");
}

/**
 * A PNG, WebP or JPEG whose extension matches its type, 1 byte to 1 MiB. Browsers derive `type`
 * from the extension, so a mismatch means the name and the reported type disagree.
 */
export function validateIcon(file: FileFacts): string | null {
  if (!(ICON_CONTENT_TYPES as readonly string[]).includes(file.type)) {
    return "Choose a PNG, WebP or JPEG image.";
  }
  const extensions = ICON_EXTENSIONS[file.type as IconContentType];
  if (!hasExtension(file.name, extensions)) {
    return `Rename the image to end in ${extensions.join(" or ")} to match its type.`;
  }
  return checkFile(file, MAX_ICON_BYTES, "Icons can be at most 1 MB.");
}
