import { useId, type ComponentProps } from "react";
import { cx } from "@/lib/cx";

/**
 * A multi-line text input with Input's look: the muted border (4.6:1), red-700 with
 * `aria-invalid`, and 16px text so iOS doesn't zoom on focus. It grows only when dragged.
 */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cx(
        "focus-ring block min-h-28 w-full resize-y rounded-control border border-muted bg-surface px-3 py-2.5 text-base text-ink placeholder:text-muted",
        "transition-colors duration-(--duration-fast) aria-invalid:border-red-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export interface TextareaFieldProps extends ComponentProps<"textarea"> {
  label: string;
  /** The backend's `details[name]` for this field: each message is shown under the textarea. */
  errors?: string[];
  hint?: string;
}

/** A labelled Textarea with its hint and messages, wired up the way Field wires an input. */
export function TextareaField({ label, errors, hint, id, ...props }: TextareaFieldProps) {
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
      <Textarea
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
        <p
          id={errorId}
          className={cx(
            "text-sm text-red-700",
            "transition-[opacity,translate] duration-(--duration-fast) ease-out",
            "starting:opacity-0 motion-safe:starting:-translate-y-1",
          )}
        >
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
