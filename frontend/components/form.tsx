import type { Ref } from "react";
import { ApiError } from "@/lib/api/client";

export type FieldErrors<K extends string> = Partial<Record<K, string[]>>;

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const OFFLINE_MESSAGE = "Couldn't reach Sprout. Check your connection and try again.";

/**
 * Splits a failed request into field errors and one form-level message. Only VALIDATION_ERROR and
 * CONFLICT details belong to a field; a key this form doesn't show, or no details at all, makes
 * the envelope's message form-level. Other codes (a 401, a 429) show the envelope's message, which
 * never depends on whether an account exists. INTERNAL and network failures get a generic one.
 */
export function toFormErrors<K extends string>(err: unknown, fields: readonly K[]) {
  const errors: FieldErrors<K> = {};
  if (!(err instanceof ApiError)) return { errors, message: GENERIC_MESSAGE };
  if (err.status === 0) return { errors, message: OFFLINE_MESSAGE };
  if (err.code === "INTERNAL") return { errors, message: GENERIC_MESSAGE };
  if (err.code !== "VALIDATION_ERROR" && err.code !== "CONFLICT") {
    return { errors, message: err.message };
  }
  let unplaced = false;
  for (const [key, messages] of Object.entries(err.details ?? {})) {
    if (fields.includes(key as K) && Array.isArray(messages)) errors[key as K] = messages;
    else unplaced = true;
  }
  const placed = Object.keys(errors).length > 0;
  return { errors, message: unplaced || !placed ? err.message : null };
}

/**
 * The form-level message. Always mounted, so screen readers are already watching it when a message
 * arrives; focused after a failed submit that no single field explains.
 */
export function FormAlert({ ref, message }: { ref: Ref<HTMLDivElement>; message: string | null }) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      // red-700 on red-50 is 5.9:1.
      className={
        message
          ? "focus-ring mb-5 rounded-control border border-red-700/25 bg-red-50 px-3.5 py-3 text-sm text-red-700"
          : undefined
      }
    >
      {message}
    </div>
  );
}
