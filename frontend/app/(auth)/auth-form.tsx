"use client";

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { toFormErrors, type FieldErrors } from "@/components/form";
import type { Rule } from "@/lib/auth-validation";
import { cx } from "@/lib/cx";

// Shared with the review form since Phase 10; re-exported so the auth forms' imports stay put.
export { FormAlert, type FieldErrors } from "@/components/form";

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
