import { cx } from "@/lib/cx";

const STAR_PATH =
  "M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96z";

function Stars({ className }: { className: string }) {
  return (
    <span className={cx("flex", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" className="size-[1em] shrink-0 fill-current">
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
}

export interface StarRatingProps {
  /** The average, 1–5, or null when the app has no reviews yet. */
  value: number | null;
  /** Shown after the number, e.g. "(12)". */
  reviewCount?: number;
  className?: string;
}

/** A read-only rating: partly filled stars plus the number, announced as one label. */
export function StarRating({ value, reviewCount, className }: StarRatingProps) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={cx("text-sm text-muted", className)}>No ratings yet</span>;
  }
  const rounded = value.toFixed(1);
  const fill = `${(Math.min(Math.max(value, 0), 5) / 5) * 100}%`;
  const reviews =
    reviewCount === undefined ? "" : `, ${reviewCount} ${reviewCount === 1 ? "review" : "reviews"}`;

  return (
    <span
      role="img"
      aria-label={`Rated ${rounded} out of 5${reviews}`}
      className={cx("inline-flex items-center gap-1.5 text-sm", className)}
    >
      {/* green-600 stars are 3.1:1 on surface; the empty ones are the track behind them. */}
      <span className="relative inline-flex">
        <Stars className="text-slate-300" />
        <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: fill }}>
          <Stars className="text-green-600" />
        </span>
      </span>
      <span className="font-medium text-ink">{rounded}</span>
      {reviewCount !== undefined && <span className="text-muted">({reviewCount})</span>}
    </span>
  );
}
