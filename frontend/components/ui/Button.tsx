import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm";

// §0 contrast: the primary label is ink on brand (7.8:1), never white (2.3:1). Hover darkens to
// green-600, which still holds ink at 5.6:1.
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-ink hover:bg-green-600",
  secondary: "border border-slate-300 bg-surface text-ink hover:bg-slate-100",
  ghost: "text-ink hover:bg-slate-100",
};

// md is a 44px touch target.
const SIZES: Record<ButtonSize, string> = {
  md: "h-11 px-5 text-base",
  sm: "h-9 px-3.5 text-sm",
};

/**
 * Button styling, for a `<Link>` that should look like a button. Feedback lands on pointer-down
 * (`:active`): a 0.97 press that motion-reduce drops, keeping the color change.
 */
export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return cx(
    "focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap select-none",
    "transition duration-(--duration-press) ease-out motion-safe:not-disabled:active:scale-97",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
  );
}

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(buttonStyles(variant, size), className)} {...props} />;
}
