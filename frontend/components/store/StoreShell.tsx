import Link from "next/link";
import type { ReactNode } from "react";
import { CATEGORIES, type Category, type User } from "@/lib/api/types";
import { categoryHref } from "@/lib/categories";
import { cx } from "@/lib/cx";
import { CategoryIcon, NavIcon, Shapes } from "./art";

export type BrowseKey = "discover" | "popular" | "new" | "top-rated";

/** The store page being shown: one of the browse lists, or a category. */
export type StoreSection = BrowseKey | Category;

const BROWSE: { key: BrowseKey; label: string; href: string }[] = [
  { key: "discover", label: "Discover", href: "/" },
  { key: "popular", label: "Top charts", href: "/?sort=popular" },
  { key: "new", label: "New releases", href: "/?sort=new" },
  { key: "top-rated", label: "Top rated", href: "/?sort=top-rated" },
];

/** Developers go straight to the upload form; everyone else signs up first (and can choose there). */
export function publishHrefFor(user: User | null): string {
  return user?.role === "developer" ? "/dashboard/apps/new" : "/sign-up";
}

const NAV_ITEM = cx(
  "focus-ring flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium",
  "transition-[background-color,color,scale] duration-(--duration-press) ease-out motion-safe:active:scale-[0.98]",
);
const NAV_ACTIVE = "bg-green-100 text-green-800";
const NAV_IDLE = "text-slate-700 hover:bg-slate-100 hover:text-ink";

/** The store's own navigation: browse lists, every category, and a card for developers. */
function Sidebar({ active, publishHref }: { active: StoreSection; publishHref: string }) {
  return (
    <aside className="hidden lg:flex lg:flex-col">
      <nav aria-label="Store">
        <ul className="flex flex-col gap-1">
          {BROWSE.map(({ key, label, href }) => (
            <li key={key}>
              <Link
                href={href}
                aria-current={key === active ? "page" : undefined}
                className={cx(NAV_ITEM, key === active ? NAV_ACTIVE : NAV_IDLE)}
              >
                <NavIcon name={key} />
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 mb-2 px-3 text-sm font-semibold text-ink">Categories</p>
        <ul className="flex flex-col gap-0.5">
          {CATEGORIES.map((category) => (
            <li key={category}>
              <Link
                href={categoryHref(category)}
                aria-current={category === active ? "page" : undefined}
                className={cx(NAV_ITEM, category === active ? NAV_ACTIVE : NAV_IDLE)}
              >
                <CategoryIcon
                  category={category}
                  className={category === active ? undefined : "text-slate-500"}
                />
                {category}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="relative mt-6 shrink-0 overflow-hidden rounded-3xl bg-linear-to-br from-green-100 via-surface to-cyan-100 p-5 shadow-card">
        <p className="text-sm font-semibold text-slate-700">For developers</p>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-bold tracking-tight text-green-700">Free</span>
          <span className="text-sm leading-tight text-slate-700">to publish, every app</span>
        </p>
        <Link
          href={publishHref}
          className="focus-ring mt-3 inline-block rounded-control text-lg font-semibold text-ink underline-offset-4 hover:underline"
        >
          Start publishing
        </Link>
        <Shapes className="-mx-5 mt-4 -mb-5 block w-[calc(100%+2.5rem)]" />
      </div>
    </aside>
  );
}

/** Below lg the sidebar folds into a swipeable row of chips. */
function ChipNav({ active }: { active: StoreSection }) {
  const chip =
    "focus-ring inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium whitespace-nowrap transition-[background-color,scale] duration-(--duration-press) ease-out motion-safe:active:scale-97";
  const idle = "bg-surface text-slate-700 shadow-card hover:bg-slate-100";
  return (
    <nav aria-label="Store" className="-mx-4 sm:-mx-6 lg:hidden">
      <ul className="flex gap-2 overflow-x-auto px-4 pt-0.5 pb-1 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
        {BROWSE.map(({ key, label, href }) => (
          <li key={key}>
            <Link
              href={href}
              aria-current={key === active ? "page" : undefined}
              className={cx(chip, key === active ? NAV_ACTIVE : idle)}
            >
              <NavIcon name={key} className="size-4" />
              {label}
            </Link>
          </li>
        ))}
        {CATEGORIES.map((category) => (
          <li key={category}>
            <Link
              href={categoryHref(category)}
              aria-current={category === active ? "page" : undefined}
              className={cx(chip, category === active ? NAV_ACTIVE : idle)}
            >
              <CategoryIcon
                category={category}
                className={cx("size-4", category !== active && "text-slate-500")}
              />
              {category}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Every store page's frame: the sidebar beside a column of content on wide screens, the chip row
 * above it on narrow ones. `active` marks the page in both.
 */
export function StoreShell({
  active,
  publishHref,
  children,
}: {
  active: StoreSection;
  publishHref: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8 lg:py-8">
      <Sidebar active={active} publishHref={publishHref} />
      <div className="flex min-w-0 flex-col gap-8 lg:gap-10">
        <ChipNav active={active} />
        {children}
      </div>
    </div>
  );
}

/** Every category but the one being shown, as a closing row of pills. */
export function OtherCategories({ current }: { current: Category }) {
  return (
    <section aria-labelledby="other-categories" className="flex flex-col gap-4">
      <h2 id="other-categories" className="text-xl font-semibold text-ink sm:text-2xl">
        Explore other categories
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATEGORIES.filter((category) => category !== current).map((category) => (
          <li key={category}>
            <Link
              href={categoryHref(category)}
              className={cx(
                "focus-ring flex h-14 items-center gap-3 rounded-2xl bg-surface px-4 text-sm font-semibold text-ink shadow-card hover:shadow-overlay",
                "transition duration-(--duration-press) ease-out motion-safe:active:scale-[0.98]",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-800">
                <CategoryIcon category={category} className="size-4" />
              </span>
              <span className="min-w-0 truncate">{category}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
