import type { AppSummary } from "@/lib/api/types";
import { cx } from "@/lib/cx";

/** Every store control presses in on pointer-down, where motion is welcome. */
export const PRESS =
  "transition duration-(--duration-press) ease-out motion-safe:active:scale-[0.98]";

/** Ink on a light ground: the store's strong button, since brand-on-green would vanish. */
export const INK_BUTTON = cx(
  "focus-ring inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-ink px-6 font-semibold text-surface hover:bg-slate-700",
  PRESS,
);

/** The small "Get" pill beside every app in a list. */
const GET_BUTTON = cx(
  "focus-ring inline-flex h-8 w-16 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-800 hover:bg-green-200",
  PRESS,
);

// Banners wash in a blend of the two §0 hues; ink text holds 12:1 or more on all three.
export const WASHES = [
  "from-green-300 via-green-200 to-cyan-200",
  "from-cyan-300 via-cyan-200 to-green-200",
  "from-green-200 via-cyan-100 to-cyan-300",
];

/**
 * Downloads the app. A plain link, never next/link: a prefetch would count a download (INV-3), so
 * nothing but the click may request it.
 */
export function GetLink({ app, className }: { app: AppSummary; className?: string }) {
  return (
    <a href={`/api/apps/${app.id}/download`} rel="nofollow" className={cx(GET_BUTTON, className)}>
      Get<span className="sr-only"> {app.title}</span>
    </a>
  );
}

/** A compact rating: one green star and the average, or "New" before the first review. */
export function Rating({ app }: { app: AppSummary }) {
  if (app.avg_rating === null) return <span>New</span>;
  const value = app.avg_rating.toFixed(1);
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Rated ${value} out of 5`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-green-600">
        <path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96z" />
      </svg>
      {value}
    </span>
  );
}
