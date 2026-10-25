import Link from "next/link";
import type { AppSummary } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { formatCompact } from "@/lib/format";
import { StarRating } from "./ui/StarRating";

// Letter icons rotate through the §0 hues' light tints, each with its own 800 text (6.5:1 or more).
// Never white on brand or accent. Featured cards wash their background in the same hue.
const TINTS = [
  { icon: "bg-green-100 text-green-800", wash: "from-green-50" },
  { icon: "bg-cyan-100 text-cyan-800", wash: "from-cyan-50" },
  { icon: "bg-slate-200 text-slate-700", wash: "from-slate-100" },
];

function tint(id: number) {
  return TINTS[id % TINTS.length];
}

const ICON_SIZES = {
  sm: { px: 48, className: "size-12 text-xl" },
  md: { px: 56, className: "size-14 text-2xl" },
  lg: { px: 72, className: "size-18 text-3xl" },
  xl: { px: 96, className: "size-20 text-4xl sm:size-24" },
};

export interface AppIconProps {
  app: Pick<AppSummary, "id" | "title" | "icon_url">;
  size: keyof typeof ICON_SIZES;
}

/**
 * The app's icon, decorative (its title is always beside it). Seed apps have none, so the usual
 * case is the title's first letter on a tint. A rounded square at 22.5%, like a platform icon.
 */
export function AppIcon({ app, size }: AppIconProps) {
  const { px, className } = ICON_SIZES[size];
  const shape = cx("shrink-0 rounded-[22.5%] ring-1 ring-ink/5", className);
  if (app.icon_url) {
    return (
      // A public GCS URL (G5). next/image would need images.remotePatterns, and next.config.ts is
      // frozen this phase.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={app.icon_url}
        alt=""
        width={px}
        height={px}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cx(shape, "bg-slate-100 object-cover")}
      />
    );
  }
  // Array.from keeps a surrogate pair (an emoji, say) whole.
  const letter = Array.from(app.title.trim())[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      className={cx(shape, "flex items-center justify-center font-semibold", tint(app.id).icon)}
    >
      {letter}
    </span>
  );
}

/**
 * One app in a grid. The whole card is a single link, so it's one tab stop; it lifts slightly on
 * hover and presses in on pointer-down, where motion is welcome.
 */
export function AppCard({ app, featured = false }: { app: AppSummary; featured?: boolean }) {
  return (
    <Link
      href={`/apps/${app.id}`}
      className={cx(
        "focus-ring flex h-full gap-4 rounded-card border border-slate-200 bg-surface shadow-card",
        "transition duration-(--duration-fast) ease-out hover:border-slate-300 hover:shadow-overlay",
        "motion-safe:active:scale-[0.98]",
        featured
          ? cx("flex-col bg-linear-to-b to-surface p-5 sm:p-6", tint(app.id).wash)
          : "items-start p-4",
      )}
    >
      <AppIcon app={app} size={featured ? "lg" : "md"} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* cyan-700 is 5.1:1 on surface. */}
        <p className="text-xs font-semibold tracking-wide text-cyan-700 uppercase">
          {app.category}
        </p>
        <p
          className={cx(
            "mt-0.5 font-semibold text-ink wrap-anywhere",
            featured ? "text-xl" : "truncate",
          )}
        >
          {app.title}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{app.tagline}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-sm text-muted">
          <StarRating value={app.avg_rating} reviewCount={app.review_count} />
          <span>{formatCompact(app.download_count)} downloads</span>
        </div>
      </div>
    </Link>
  );
}

/** A responsive grid of cards: one column on phones, up to three on wide screens. */
export function AppGrid({ apps, featured }: { apps: AppSummary[]; featured?: boolean }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {apps.map((app) => (
        <li key={app.id}>
          <AppCard app={app} featured={featured} />
        </li>
      ))}
    </ul>
  );
}
