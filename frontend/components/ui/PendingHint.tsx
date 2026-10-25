"use client";

import { useLinkStatus } from "next/link";
import { cx } from "@/lib/cx";

/**
 * A dot for inside a `<Link>`: it fades in only once that link's navigation has taken longer than
 * --duration-fast, so a fast page never flashes it, and leaves the instant the page lands. The
 * outer dot fades and the inner one pulses, so the two never fight over one opacity; it pulses only
 * while pending, and reduced motion keeps the fade and drops the pulse, as skeletons do.
 */
export function PendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cx(
        "size-1.5 shrink-0 transition-opacity ease-out",
        pending
          ? "opacity-60 duration-(--duration-fast) delay-(--duration-fast)"
          : "opacity-0 duration-0",
        className,
      )}
    >
      <span
        className={cx(
          "block size-full rounded-full bg-current",
          pending && "motion-safe:animate-pulse",
        )}
      />
    </span>
  );
}
