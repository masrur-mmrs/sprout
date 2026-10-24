import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

/** A raised surface for grouped content. Pass `className` for padding or layout changes. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-card border border-slate-200 bg-surface p-5 shadow-card", className)}
      {...props}
    />
  );
}
