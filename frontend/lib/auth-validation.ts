/**
 * Client-side checks that mirror backend/src/modules/auth/auth.schemas.ts, so most mistakes are
 * caught before a request. The backend stays the authority: its 400 `details` are shown the same
 * way. Lengths count UTF-16 code units, as zod does.
 */

/** A field's rule: the problem with `value`, or undefined when it passes. */
export type Rule = (value: string) => string | undefined;

/** A reset token as issued: randomBytes(32) in lower-case hex. */
export const RESET_TOKEN = /^[0-9a-f]{64}$/;

// zod 4's z.email() pattern, copied so both sides accept exactly the same addresses.
const EMAIL =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

// bcrypt reads only the first 72 bytes; the backend rejects anything longer.
const MAX_PASSWORD_BYTES = 72;

export const checkUsername: Rule = (value) => {
  const username = value.trim();
  if (!username) return "Enter a username.";
  if (username.length < 3 || username.length > 50) return "Use 3–50 characters.";
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Use only letters, numbers and underscores.";
};

export const checkEmail: Rule = (value) => {
  // Trimmed and lower-cased first, as the backend does (G10).
  const email = value.trim().toLowerCase();
  if (!email) return "Enter your email address.";
  if (!EMAIL.test(email)) return "Enter a valid email address.";
  if (email.length > 100) return "Use at most 100 characters.";
};

/** Every new password: sign-up and reset. */
export const checkNewPassword: Rule = (password) => {
  if (!password) return "Enter a password.";
  if (password.length < 8) return "Use at least 8 characters.";
  if (password.length > 72) return "Use at most 72 characters.";
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return "Too long: emoji and accented letters count as more than one character.";
  }
};

/**
 * Presence only. Sign-in uses this, so it never hints at the password rules. Untrimmed unless
 * asked: a password may be all spaces.
 */
export function required(message: string, { trim = false } = {}): Rule {
  return (value) => ((trim ? value.trim() : value) ? undefined : message);
}
