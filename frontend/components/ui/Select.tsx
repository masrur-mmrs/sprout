import { useId, type ComponentProps } from "react";
import { cx } from "@/lib/cx";

/**
 * A native select with Input's look: the muted border (4.6:1), red-700 with `aria-invalid`, and
 * 16px text so iOS doesn't zoom on focus. The chevron is drawn here, since `appearance-none` drops
 * the platform's. An empty placeholder option ("Choose…") shows in the muted color.
 */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cx(
          "focus-ring h-11 w-full appearance-none rounded-control border border-muted bg-surface pr-10 pl-3 text-base text-ink",
          "has-[option[value='']:checked]:text-muted",
          "transition-colors duration-(--duration-fast) aria-invalid:border-red-700",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2 fill-none stroke-current stroke-2 text-muted"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 10l5 5 5-5" />
      </svg>
    </div>
  );
}

export interface SelectFieldProps extends ComponentProps<"select"> {
  label: string;
  /** The backend's `details[name]` for this field: each message is shown under the select. */
  errors?: string[];
  hint?: string;
}

/** A labelled Select with its hint and messages, wired up the way Field wires an input. */
export function SelectField({ label, errors, hint, id, ...props }: SelectFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const invalid = errors !== undefined && errors.length > 0;
  const describedBy = [hint && hintId, invalid && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Select
        id={inputId}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {invalid && (
        // red-700 is 6.2:1 on surface, the one error red.
        <p id={errorId} className="text-sm text-red-700">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
