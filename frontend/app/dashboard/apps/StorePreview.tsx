import type { ReactNode } from "react";
import { Confetti } from "@/components/store/art";
import { WASHES } from "@/components/store/parts";
import type { AppText } from "@/lib/app-validation";
import { cx } from "@/lib/cx";

/** A placeholder until the field is filled: slate-600 holds 6:1 on the wash. */
function Placeholder({ value, fallback }: { value: string; fallback: string }) {
  const text = value.trim();
  return text ? <>{text}</> : <span className="text-slate-600">{fallback}</span>;
}

/**
 * The app as the storefront's featured banner would show it, filled in as the form is: the same
 * wash, pill and "Get it free" as the banner on Discover. It mirrors the fields above it, so it's
 * hidden from assistive tech, and nothing in it is a control. A newly chosen icon pops in.
 */
export function StorePreview({
  text,
  icon,
  iconKey,
}: {
  text: AppText;
  /** The icon as it will look (the app's own icon component), and what identifies it. */
  icon: ReactNode;
  iconKey: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "relative overflow-hidden rounded-3xl bg-linear-to-br p-5 shadow-card sm:p-6",
        WASHES[0],
      )}
    >
      <Confetti className="pointer-events-none absolute -top-6 -right-10 w-44 opacity-60" />
      <p className="relative inline-block rounded-full bg-surface/70 px-3 py-1 text-sm font-semibold text-ink">
        Store preview
      </p>
      <div className="relative mt-5 flex items-center gap-4">
        <span
          key={iconKey}
          className={cx(
            "flex transition-[opacity,scale] duration-(--duration-spring) ease-(--ease-spring)",
            "starting:opacity-0 motion-safe:starting:scale-75",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="line-clamp-2 text-2xl font-bold tracking-tight text-ink wrap-anywhere">
            <Placeholder value={text.title} fallback="Your app" />
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-700">
            <Placeholder value={text.category} fallback="Category" />
          </p>
        </div>
      </div>
      <p className="relative mt-4 line-clamp-2 text-base text-slate-800 wrap-anywhere">
        <Placeholder value={text.tagline} fallback="One line on what it does." />
      </p>
      <p className="relative mt-3 flex flex-wrap gap-x-2 text-sm font-medium text-slate-700">
        <span>New</span>
        <span>·</span>
        <span className="wrap-anywhere">
          Version <Placeholder value={text.version} fallback="1.0" />
        </span>
        <span>·</span>
        <span>Free</span>
      </p>
      <span className="relative mt-5 inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-semibold text-surface">
        Get it free
      </span>
    </div>
  );
}
