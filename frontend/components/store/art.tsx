import type { ReactNode } from "react";
import type { Category } from "@/lib/api/types";
import { cx } from "@/lib/cx";

/** A 24px line icon in the current text color. Decorative: its label is always beside it. */
function Glyph({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cx("size-5 shrink-0 fill-none stroke-current", className)}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const STAR = "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z";

export const NAV_ICONS = {
  discover: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  popular: <path d="M5 20v-8M12 20V5M19 20v-5" />,
  new: (
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  ),
  "top-rated": <path d={STAR} />,
} satisfies Record<string, ReactNode>;

const CATEGORY_ICONS: Record<Category, ReactNode> = {
  Productivity: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  "Developer Tools": <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />,
  Games: (
    <>
      <path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.5 4.5v.5a4 4 0 0 1-7 2.6h-4a4 4 0 0 1-7-2.6V12a4.5 4.5 0 0 1 4.5-4.5z" />
      <path d="M7.5 10.5v3M6 12h3M15.5 11h.01M17.5 13h.01" />
    </>
  ),
  Design: <path d="M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16zM14 7l3 3" />,
  Utilities: (
    <>
      <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="10" cy="17" r="2.5" />
    </>
  ),
  Education: (
    <path d="M3 9l9-4.5L21 9l-9 4.5zM7 11v4.5c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V11M21 9v5" />
  ),
  "Music & Audio": (
    <>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
  "Photo & Video": (
    <>
      <path d="M4 8.5a2 2 0 0 1 2-2h2l1.5-2h5l1.5 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  Social: <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z" />,
  Other: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
};

export function NavIcon({ name, className }: { name: keyof typeof NAV_ICONS; className?: string }) {
  return <Glyph className={className}>{NAV_ICONS[name]}</Glyph>;
}

export function CategoryIcon({ category, className }: { category: Category; className?: string }) {
  return <Glyph className={className}>{CATEGORY_ICONS[category]}</Glyph>;
}

export function ArrowIcon({
  direction,
  className,
}: {
  direction: "left" | "right";
  className?: string;
}) {
  return (
    <Glyph className={className}>
      <path d={direction === "left" ? "M14.5 6l-6 6 6 6" : "M9.5 6l6 6-6 6"} />
    </Glyph>
  );
}

/**
 * Sprout's mascot: a seedling with a face. Cyan body, two green leaves, waving. Every drawing on
 * the storefront is decorative, so each is hidden from assistive tech.
 */
export function Mascot({ className, wave = true }: { className?: string; wave?: boolean }) {
  return (
    <svg viewBox="0 0 200 220" aria-hidden="true" className={className}>
      <ellipse cx="100" cy="210" rx="58" ry="7" className="fill-ink/10" />
      <path d="M100 74V42" className="stroke-green-700" strokeWidth="6" strokeLinecap="round" />
      <path d="M100 50C70 52 54 32 57 12c22 0 41 13 43 38z" className="fill-green-500" />
      <path d="M100 46c18-26 44-30 60-21-8 22-32 31-60 21z" className="fill-green-400" />
      {wave ? (
        <path
          d="M156 142c14-6 22-18 22-34"
          className="fill-none stroke-ink"
          strokeWidth="6"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M156 142c12 6 18 16 16 30"
          className="fill-none stroke-ink"
          strokeWidth="6"
          strokeLinecap="round"
        />
      )}
      <path
        d="M44 142c-12 6-18 16-16 30"
        className="fill-none stroke-ink"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M82 198v10M118 198v10"
        className="stroke-ink"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M40 122c0-34 26-50 60-50s60 16 60 50v46c0 22-18 32-60 32s-60-10-60-32z"
        className="fill-cyan-300"
      />
      <ellipse cx="82" cy="122" rx="6.5" ry="9" className="fill-ink" />
      <ellipse cx="118" cy="122" rx="6.5" ry="9" className="fill-ink" />
      <circle cx="84" cy="118" r="2.2" className="fill-surface" />
      <circle cx="120" cy="118" r="2.2" className="fill-surface" />
      <circle cx="68" cy="142" r="7" className="fill-green-300" />
      <circle cx="132" cy="142" r="7" className="fill-green-300" />
      <path
        d="M87 146q13 13 26 0"
        className="fill-none stroke-ink"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Sprout's three shapes (circle, triangle, half-round), as in the storefront's promo cards. */
export function Shapes({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 90" aria-hidden="true" className={className}>
      <circle cx="42" cy="56" r="40" className="fill-green-400" />
      <path d="M118 6l46 84H72z" className="fill-ink" />
      <path d="M160 16h18a42 42 0 0 1 0 84h-18z" className="fill-cyan-400" />
    </svg>
  );
}

/** Small scattered squares and ticks, like paper confetti. */
export function Confetti({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 160" aria-hidden="true" className={className}>
      <rect
        x="18"
        y="20"
        width="12"
        height="12"
        rx="2"
        transform="rotate(20 24 26)"
        className="fill-green-400"
      />
      <rect
        x="196"
        y="16"
        width="10"
        height="10"
        rx="2"
        transform="rotate(-15 201 21)"
        className="fill-cyan-400"
      />
      <rect
        x="214"
        y="118"
        width="12"
        height="12"
        rx="2"
        transform="rotate(30 220 124)"
        className="fill-green-300"
      />
      <rect
        x="40"
        y="128"
        width="9"
        height="9"
        rx="2"
        transform="rotate(-25 44 132)"
        className="fill-cyan-500"
      />
      <g className="fill-none stroke-ink" strokeWidth="3" strokeLinecap="round">
        <path d="M70 16l10 6" />
        <path d="M168 60l12-4" />
        <path d="M14 84l4 12" />
        <path d="M150 140l10 6" />
      </g>
    </svg>
  );
}

/** A laptop, for the developer promo: the mascot's desk. */
export function Laptop({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" className={className}>
      <path d="M30 8h100a6 6 0 0 1 6 6v64H24V14a6 6 0 0 1 6-6z" className="fill-ink" />
      <rect x="34" y="18" width="92" height="50" rx="3" className="fill-cyan-200" />
      <path
        d="M44 32h40M44 42h56M44 52h28"
        className="stroke-cyan-600"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M6 78h148l-8 14H14z" className="fill-slate-700" />
    </svg>
  );
}
