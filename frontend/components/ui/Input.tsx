import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/**
 * A text input. The muted border is 4.6:1 on surface (an input's edge needs 3:1); it turns red-700
 * with `aria-invalid`. 16px text keeps iOS from zooming on focus.
 */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "focus-ring h-11 w-full rounded-control border border-muted bg-surface px-3 text-base text-ink placeholder:text-muted",
        "transition-colors duration-(--duration-fast) aria-invalid:border-red-700",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
