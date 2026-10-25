import { useId, type ComponentProps } from "react";
import { cx } from "@/lib/cx";
import { Input } from "./Input";

export interface FieldProps extends ComponentProps<"input"> {
  label: string;
  /** The backend's `details[name]` for this field: each message is shown under the input. */
  errors?: string[];
  hint?: string;
}

/**
 * A labelled input with its validation messages, wired up with aria-invalid and aria-describedby.
 * A message fades in and settles from just above; reduced motion keeps the fade, drops the move.
 */
export function Field({ label, errors, hint, id, ...props }: FieldProps) {
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
      <Input
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
