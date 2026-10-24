"use client";

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";
import { flushSync } from "react-dom";
import { ApiError } from "@/lib/api/client";
import type { Rule } from "@/lib/auth-validation";
import { cx } from "@/lib/cx";

export type FieldErrors<K extends string> = Partial<Record<K, string[]>>;

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const OFFLINE_MESSAGE = "Couldn't reach Sprout. Check your connection and try again.";

/**
 * Splits a failed request into field errors and one form-level message. Only VALIDATION_ERROR and
 * CONFLICT details belong to a field; a key this form doesn't show, or no details at all, makes
 * the envelope's message form-level. Other codes (a 401, a 429) show the envelope's message, which
 * never depends on whether an account exists. INTERNAL and network failures get a generic one.
 */
function toFormErrors<K extends string>(err: unknown, fields: readonly K[]) {
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
 * What every auth form shares: validation on submit (and again on blur once submitted, never per
 * keystroke), one request at a time, failures mapped onto fields or the alert, and focus moved to
 * the first problem. Inputs stay uncontrolled and the form has no `action`, so React never resets
 * them: a failed sign-in keeps the email.
 *
 * Forms using it set `method="post"`: a submit before hydration then can't put the credentials in
 * the URL (and from there in history and server logs), as the default GET would.
 */
export function useAuthForm<K extends string>(rules: Record<K, Rule>) {
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<FieldErrors<K>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // `pending` lands a render later; this blocks a second submit fired before it does.
  const inFlight = useRef(false);
  // The values last submitted; null until the first submit, so blur checks nothing before it.
  const submitted = useRef<Record<K, string> | null>(null);
  const fields = Object.keys(rules) as K[];

  function show(found: FieldErrors<K>, formMessage: string | null) {
    // Commit first, so the field is already described by its error when focus lands on it.
    flushSync(() => {
      setErrors(found);
      setMessage(formMessage);
    });
    const first = fields.find((field) => found[field]?.length);
    const target = first
      ? formRef.current?.elements.namedItem(first)
      : formMessage && alertRef.current;
    if (target instanceof HTMLElement) target.focus();
  }

  /** The submit handler. `send` resolves once done; while it navigates away, the form stays pending. */
  function onSubmit(send: (values: Record<K, string>, data: FormData) => Promise<void>) {
    return async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (inFlight.current) return;
      const data = new FormData(event.currentTarget);
      const values = Object.fromEntries(
        fields.map((field) => [field, String(data.get(field) ?? "")]),
      ) as Record<K, string>;
      submitted.current = values;

      const found: FieldErrors<K> = {};
      for (const field of fields) {
        const problem = rules[field](values[field]);
        if (problem) found[field] = [problem];
      }
      if (Object.keys(found).length > 0) return show(found, null);

      inFlight.current = true;
      setPending(true);
      setErrors({});
      setMessage(null);
      try {
        await send(values, data);
      } catch (err) {
        inFlight.current = false;
        setPending(false);
        const mapped = toFormErrors(err, fields);
        show(mapped.errors, mapped.message);
      }
    };
  }

  /**
   * Re-checks a field as the user leaves it, after the first submit. A passing value clears the
   * field's error only if it changed, so a server error (an email already in use) stays put until
   * the user edits it.
   */
  function onBlur(event: FocusEvent<HTMLInputElement>) {
    const field = event.currentTarget.name as K;
    const last = submitted.current;
    if (!last || !Object.hasOwn(rules, field)) return;
    const { value } = event.currentTarget;
    const problem = rules[field](value);
    if (problem) setErrors((all) => ({ ...all, [field]: [problem] }));
    else if (value !== last[field]) setErrors((all) => ({ ...all, [field]: undefined }));
  }

  return { formRef, alertRef, errors, message, pending, onSubmit, onBlur };
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

const TONES = {
  success: { path: "M7.5 12.5l3 3 6-7", className: "text-green-700" },
  error: { path: "M12 7.5v5M12 16h.01", className: "text-red-700" },
};

interface StatusPanelProps {
  tone: keyof typeof TONES;
  title: string;
  description: string;
  /**
   * It just replaced the form the user submitted: it takes focus (the focused form is gone, and
   * screen readers should read what came instead) and fades in, where motion is welcome, rather
   * than popping. Off for a state the page renders from the start.
   */
  swappedIn?: boolean;
  /** The way forward, e.g. a link styled as a button. */
  children: ReactNode;
}

/** A state in place of a form: link sent, link expired, link invalid. */
export function StatusPanel({ tone, title, description, swappedIn, children }: StatusPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  const glyph = TONES[tone];

  useEffect(() => {
    if (swappedIn) ref.current?.focus();
  }, [swappedIn]);

  return (
    <div
      ref={ref}
      tabIndex={swappedIn ? -1 : undefined}
      className={cx(
        "mt-6 flex flex-col gap-6 rounded-control",
        swappedIn &&
          "focus-ring motion-safe:transition-opacity motion-safe:duration-(--duration-spring) motion-safe:ease-spring motion-safe:starting:opacity-0",
      )}
    >
      <div className="flex items-start gap-3 rounded-control border border-slate-200 p-4">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={cx("mt-px size-5 shrink-0 fill-none stroke-current stroke-2", glyph.className)}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9.25" />
          <path d={glyph.path} />
        </svg>
        <div className="text-sm">
          <p className="font-medium text-ink">{title}</p>
          <p className="mt-1 text-muted">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
