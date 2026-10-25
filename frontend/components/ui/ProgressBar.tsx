import { cx } from "@/lib/cx";

export interface ProgressBarProps {
  /** The accessible name, e.g. "Binary upload". */
  label: string;
  /** 0–1. */
  value: number;
  /** "error" keeps the bar where it stopped, in red. */
  tone?: "default" | "error";
  className?: string;
}

/**
 * A determinate progress bar with its percentage beside it. The fill scales on X (composite-only),
 * easing from wherever it is to each new value; reduced motion jumps instead. green-700 is 4.1:1
 * on the slate-200 track (non-text needs 3:1), red-700 more.
 */
export function ProgressBar({ label, value, tone = "default", className }: ProgressBarProps) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={cx(
            "h-full origin-left rounded-full",
            "motion-safe:transition-transform motion-safe:duration-(--duration-fast) motion-safe:ease-out",
            tone === "error" ? "bg-red-700" : "bg-green-700",
          )}
          style={{ transform: `scaleX(${percent / 100})` }}
        />
      </div>
      {/* The bar already announces its value. */}
      <span aria-hidden="true" className="w-10 shrink-0 text-right text-sm text-muted tabular-nums">
        {percent}%
      </span>
    </div>
  );
}
