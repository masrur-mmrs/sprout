"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { cx } from "@/lib/cx";

const TABS = [
  { label: "Discover", href: "/", sort: undefined },
  { label: "Top charts", href: "/?sort=popular", sort: "popular" },
  { label: "New", href: "/?sort=new", sort: "new" },
] as const;

/**
 * The store's segmented control: the storefront and its two main lists. The active tab is a solid
 * brand pill; the others sit on the shared track. Only `/` lights a tab, so a category or app page
 * shows none.
 */
export function HeaderTabs() {
  return (
    // useSearchParams needs a boundary; the fallback is the same control with nothing active.
    <Suspense fallback={<Tabs active={null} />}>
      <LiveTabs />
    </Suspense>
  );
}

function LiveTabs() {
  const pathname = usePathname();
  const sort = useSearchParams().get("sort");
  const active =
    pathname !== "/" ? null : (TABS.find((tab) => (tab.sort ?? null) === sort) ?? null);
  return <Tabs active={active?.label ?? null} />;
}

function Tabs({ active }: { active: string | null }) {
  return (
    <nav aria-label="Store sections" className="hidden lg:block">
      <ul className="flex items-center gap-1 rounded-full bg-slate-100 p-1">
        {TABS.map(({ label, href }) => (
          <li key={label}>
            <Link
              href={href}
              aria-current={label === active ? "page" : undefined}
              className={cx(
                "focus-ring inline-flex h-8 items-center rounded-full px-4 text-sm font-semibold",
                "transition-[background-color,color,scale] duration-(--duration-press) ease-out motion-safe:active:scale-97",
                label === active
                  ? "bg-brand text-ink shadow-card"
                  : "text-slate-600 hover:bg-surface hover:text-ink",
              )}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
