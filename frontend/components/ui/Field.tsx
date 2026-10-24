import { useId, type ComponentProps } from "react";
import { Input } from "./Input";

export interface FieldProps extends ComponentProps<"input"> {
  label: string;
  /** The backend's `details[name]` for this field: each message is shown under the input. */
  errors?: string[];
  hint?: string;
}

/** A labelled input with its validation messages, wired up with aria-invalid and aria-describedby. */
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
        <p id={errorId} className="text-sm text-red-700">
          {errors.join(" ")}
        </p>
      )}
    </div>
  );
}
