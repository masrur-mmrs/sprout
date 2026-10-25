"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/cx";

const TABS = [
  { label: "Discover", href: "/", sort: undefined },
  { label: "Top charts", href: "/?sort=popular", sort: "popular" },
  { label: "New", href: "/?sort=new", sort: "new" },
] as const;

type Label = (typeof TABS)[number]["label"];

/** Where a tab sits in the track, as clip-path insets from each edge. */
type Insets = { top: number; right: number; bottom: number; left: number };

const TRACK = "flex items-center gap-1 rounded-full p-1";
const TAB = "inline-flex h-8 items-center rounded-full px-4 text-sm font-semibold";
const ACTIVE = "bg-brand text-ink";
const IDLE = "text-slate-600 hover:bg-surface hover:text-ink";

/**
 * The store's segmented control: the storefront and its two main lists. The active tab is a solid
 * brand pill; the others sit on the shared track. Only `/` lights a tab, so a category or app page
 * shows none. It lives in the root layout, so it outlives navigations: the pill moves to a tab the
 * moment its navigation starts and slides there, while `aria-current` waits for the URL.
 */
export function HeaderTabs() {
  return (
    // useSearchParams needs a boundary; the fallback is the same control with nothing active.
    <Suspense fallback={<Tabs current={null} shown={null} />}>
      <LiveTabs />
    </Suspense>
  );
}

function LiveTabs() {
  const pathname = usePathname();
  const sort = useSearchParams().get("sort");
  const current =
    pathname !== "/" ? null : (TABS.find((tab) => (tab.sort ?? null) === sort)?.label ?? null);
  // The tab whose navigation is loading, shown before the URL catches up. A newer navigation
  // anywhere ends its pending state, which drops it.
  const [optimistic, setOptimistic] = useState<Label | null>(null);
  const onPending = useCallback((label: Label, pending: boolean) => {
    setOptimistic((tab) => (pending ? label : tab === label ? null : tab));
  }, []);
  return <Tabs current={current} shown={optimistic ?? current} onPending={onPending} />;
}

/** Inside a tab's Link: reports when its navigation starts and ends. ⌘-click never starts one. */
function ReportPending({
  label,
  onPending,
}: {
  label: Label;
  onPending: (label: Label, pending: boolean) => void;
}) {
  const { pending } = useLinkStatus();
  useEffect(() => onPending(label, pending), [label, pending, onPending]);
  return null;
}

/**
 * Until the tabs are measured (on the server, and before hydration) the active link wears the pill
 * itself. Once measured, the pill is a brand-filled copy of the track over the real links,
 * clipped to the shown tab, so moving the clip slides the fill and the ink label together. A CSS
 * transition retargets from wherever the clip is, so a second click mid-slide simply turns it.
 */
function Tabs({
  current,
  shown,
  onPending,
}: {
  /** The URL's tab: what `aria-current` says. */
  current: Label | null;
  /** The tab the pill marks: the URL's, or one whose navigation is loading. */
  shown: Label | null;
  onPending?: (label: Label, pending: boolean) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const links = useRef(new Map<Label, HTMLAnchorElement>());
  const [rects, setRects] = useState<Record<Label, Insets> | null>(null);

  // The last tab shown, kept while none is so the pill can fade out where it was. Each return from
  // none remounts the pill, so it fades in at its tab instead of sliding over from the old one.
  const [previous, setPrevious] = useState(shown);
  const [held, setHeld] = useState(shown);
  const [entries, setEntries] = useState(0);
  if (shown !== previous) {
    setPrevious(shown);
    if (shown !== null) setHeld(shown);
    if (previous === null) setEntries((n) => n + 1);
  }

  // Tabs keep their size whichever is active, so every position is measured once, and again when
  // the track resizes (text size, zoom). Hidden below lg, it has no size to measure.
  useLayoutEffect(() => {
    const box = track.current;
    if (!box) return;
    function measure() {
      if (!box || box.clientWidth === 0) return;
      const next: Partial<Record<Label, Insets>> = {};
      for (const { label } of TABS) {
        const link = links.current.get(label);
        if (!link) return;
        next[label] = {
          top: link.offsetTop,
          left: link.offsetLeft,
          right: box.clientWidth - link.offsetLeft - link.offsetWidth,
          bottom: box.clientHeight - link.offsetTop - link.offsetHeight,
        };
      }
      // A resize that moved nothing (the observer's first call, say) keeps the same object.
      setRects((old) =>
        old && JSON.stringify(old) === JSON.stringify(next) ? old : (next as Record<Label, Insets>),
      );
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const pill = rects && held ? rects[held] : null;

  return (
    <nav aria-label="Store sections" className="hidden lg:block">
      <div ref={track} className="relative">
        <ul className={cx(TRACK, "bg-slate-100")}>
          {TABS.map(({ label, href }) => (
            <li key={label}>
              <Link
                ref={(el) => {
                  if (el) links.current.set(label, el);
                  else links.current.delete(label);
                }}
                href={href}
                aria-current={label === current ? "page" : undefined}
                className={cx(
                  "focus-ring",
                  TAB,
                  "transition-[background-color,color,scale] duration-(--duration-press) ease-out motion-safe:active:scale-97",
                  !rects && label === shown ? cx(ACTIVE, "shadow-card") : IDLE,
                )}
              >
                {label}
                {onPending && <ReportPending label={label} onPending={onPending} />}
              </Link>
            </li>
          ))}
        </ul>

        {pill && (
          // The pill's shadow, drawn by a filter around the clip so the clip can't cut it off.
          <div
            key={entries}
            aria-hidden="true"
            inert
            className={cx(
              "pointer-events-none absolute inset-0 drop-shadow-[0_1px_2px_color-mix(in_oklab,var(--color-ink)_8%,transparent)]",
              "transition-opacity duration-(--duration-fast) ease-out",
              shown ? "opacity-100" : "opacity-0",
              entries > 0 && "starting:opacity-0",
            )}
          >
            {/* The fill is the whole copy, not each tab, so mid-slide the clip shows one pill. */}
            <div
              className={cx(
                TRACK,
                "bg-brand motion-safe:transition-[clip-path] motion-safe:duration-(--duration-spring) motion-safe:ease-(--ease-spring)",
              )}
              style={{
                clipPath: `inset(${pill.top}px ${pill.right}px ${pill.bottom}px ${pill.left}px round 9999px)`,
              }}
            >
              {/* Mirrors the list's li > a, so every copy lands exactly on its link. */}
              {TABS.map(({ label }) => (
                <div key={label}>
                  <span className={cx(TAB, "text-ink")}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
