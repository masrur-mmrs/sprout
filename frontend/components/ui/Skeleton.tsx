import { cx } from "@/lib/cx";

/**
 * A loading placeholder, hidden from assistive tech (announce loading on the region instead). Size
 * it with `className`. The 2s pulse is motion-safe only; reduced motion holds it still.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx("rounded-control bg-slate-200 motion-safe:animate-pulse", className)}
    />
  );
}
