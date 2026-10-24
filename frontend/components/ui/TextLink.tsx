import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/**
 * A text link. green-700 is 4.8:1 on surface, but barely differs from the muted text around it, so
 * an underline marks it as a link without relying on color.
 */
export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cx(
        "focus-ring rounded-sm font-medium text-green-700 underline decoration-green-700/40 underline-offset-2",
        "transition-colors duration-(--duration-fast) hover:decoration-green-700",
        className,
      )}
      {...props}
    />
  );
}
