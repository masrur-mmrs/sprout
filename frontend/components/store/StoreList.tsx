import Link from "next/link";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/AppCard";
import { ListNotice, Pagination, PastTheEnd } from "@/components/Pagination";
import type { AppPage, AppSort, AppSummary } from "@/lib/api/types";
import { browseHref } from "@/lib/browse";
import { cx } from "@/lib/cx";
import { formatCompact } from "@/lib/format";
import { Confetti, Mascot } from "./art";
import { GetLink, PRESS, Rating, WASHES } from "./parts";

const SORTS: { sort: AppSort; label: string }[] = [
  { sort: "popular", label: "Popular" },
  { sort: "new", label: "New" },
  { sort: "top-rated", label: "Top rated" },
];

/** A page-one list this long opens with its first three as cards, then the rest as rows. */
const PODIUM = 3;

export interface StoreListProps {
  /** The page's h1, and the name of the region that holds the list. */
  title: string;
  /** A pill above the title: what kind of list this is. */
  kind: string;
  description: string;
  /** The banner's big glyph: the list's or the category's icon. */
  glyph: ReactNode;
  /** Which banner wash, so neighbouring pages don't share one. */
  wash: number;
  /** The page's path; sort and page links keep it. */
  path: string;
  sort: AppSort;
  data: AppPage;
  /** Category pages offer their own sort; the browse lists are each one sort already. */
  sortable?: boolean;
  /** Category pages leave the category out of each row: they all share it. */
  showCategory?: boolean;
}

/**
 * A store list: a banner naming it, an optional sort control, then the apps. Page one opens with
 * the first three as cards; every other app is a row with its rank (when the order is a ranking),
 * its numbers and a Get button. Each app's link names its downloads, so a list reads in full.
 */
export function StoreList({
  title,
  kind,
  description,
  glyph,
  wash,
  path,
  sort,
  data,
  sortable = false,
  showCategory = true,
}: StoreListProps) {
  const headingId = "list-heading";
  const totalPages = Math.ceil(data.total / data.pageSize);
  const ranked = sort !== "new";
  const offset = (data.page - 1) * data.pageSize;
  const podium = data.page === 1 && data.items.length > PODIUM ? data.items.slice(0, PODIUM) : [];
  const rows = data.items.slice(podium.length);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-8">
      <header
        className={cx(
          "relative grid overflow-hidden rounded-[2rem] bg-linear-to-br p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_16rem]",
          WASHES[wash % WASHES.length],
        )}
      >
        <div className="relative z-10 flex flex-col items-start">
          <p className="rounded-full bg-surface/70 px-3 py-1 text-sm font-semibold text-ink">
            {kind}
          </p>
          <h1
            id={headingId}
            className="mt-4 text-3xl font-bold tracking-tight text-ink sm:text-5xl"
          >
            {title}
          </h1>
          <p className="mt-3 max-w-md text-base text-slate-800">{description}</p>
          <p className="mt-4 text-sm font-semibold text-slate-700">
            {data.total === 1 ? "1 app" : `${formatCompact(data.total)} apps`}
            {totalPages > 1 && ` · page ${data.page} of ${totalPages}`}
          </p>
        </div>
        <div aria-hidden="true" className="pointer-events-none relative hidden md:block">
          <Confetti className="absolute inset-0 m-auto w-full" />
          <span className="absolute top-1/2 left-6 flex size-24 -translate-y-1/2 -rotate-8 items-center justify-center rounded-[22.5%] bg-surface/85 text-green-700 shadow-overlay [&_svg]:size-12">
            {glyph}
          </span>
          <Mascot className="absolute right-0 -bottom-16 w-36" />
        </div>
      </header>

      {sortable && <SortControl path={path} sort={sort} />}

      {data.total === 0 ? (
        <ListNotice title="No apps here yet" className="rounded-3xl bg-surface">
          Check back soon, or browse another category.
        </ListNotice>
      ) : data.items.length === 0 ? (
        <PastTheEnd firstPageHref={browseHref(path, { sort, page: 1 })} />
      ) : (
        <div className="flex flex-col gap-6">
          {podium.length > 0 && (
            <ol className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 sm:scroll-px-6 [scrollbar-width:none] sm:-mx-6 sm:px-6 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
              {podium.map((app, i) => (
                <li key={app.id} className="w-[78%] shrink-0 snap-start md:w-auto">
                  <PodiumCard
                    app={app}
                    badge={ranked ? `#${i + 1}` : "Just in"}
                    wash={i}
                    showCategory={showCategory}
                  />
                </li>
              ))}
            </ol>
          )}
          {rows.length > 0 && (
            <ol
              start={ranked ? offset + podium.length + 1 : undefined}
              className="flex flex-col rounded-3xl bg-surface p-2 shadow-card sm:p-3"
            >
              {rows.map((app, i) => (
                <li key={app.id} className="border-slate-100 not-first:border-t">
                  <Row
                    app={app}
                    rank={ranked ? offset + podium.length + i + 1 : null}
                    showCategory={showCategory}
                  />
                </li>
              ))}
            </ol>
          )}
          <Pagination
            page={data.page}
            totalPages={totalPages}
            hrefFor={(page) => browseHref(path, { sort, page })}
          />
        </div>
      )}
    </section>
  );
}

/** Sort links are plain links marked with aria-current, and keep the scroll position. */
function SortControl({ path, sort }: { path: string; sort: AppSort }) {
  return (
    <nav aria-label="Sort apps" className="flex items-center gap-3">
      <span className="text-sm font-medium text-slate-600">Sort by</span>
      <ul className="flex rounded-full bg-slate-100 p-1">
        {SORTS.map((option) => (
          <li key={option.sort}>
            <Link
              href={browseHref(path, { sort: option.sort, page: 1 })}
              scroll={false}
              aria-current={option.sort === sort ? "page" : undefined}
              className={cx(
                "focus-ring flex h-8 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap",
                "transition-[color,background-color,scale] duration-(--duration-press) ease-out motion-safe:active:scale-97",
                option.sort === sort
                  ? "bg-brand text-ink shadow-card"
                  : "text-slate-600 hover:bg-surface hover:text-ink",
              )}
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Meta({ app, showCategory }: { app: AppSummary; showCategory: boolean }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
      <Rating app={app} />
      <span aria-hidden="true">·</span>
      <span>{formatCompact(app.download_count)} downloads</span>
      {showCategory && (
        <>
          <span aria-hidden="true">·</span>
          <span>{app.category}</span>
        </>
      )}
    </span>
  );
}

/**
 * One of the first three: a washed card whose title link stretches over the whole card, with the
 * Get button raised above it.
 */
function PodiumCard({
  app,
  badge,
  wash,
  showCategory,
}: {
  app: AppSummary;
  badge: string;
  wash: number;
  showCategory: boolean;
}) {
  return (
    <article
      className={cx(
        "group relative flex h-full flex-col rounded-3xl bg-linear-to-br p-5 shadow-card transition-shadow duration-(--duration-fast) hover:shadow-overlay",
        WASHES[wash % WASHES.length],
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="transition-transform duration-(--duration-spring) ease-(--ease-spring) motion-safe:group-hover:-translate-y-1">
          <AppIcon app={app} size="lg" />
        </span>
        <span className="rounded-full bg-surface/75 px-2.5 py-1 text-sm font-bold text-ink tabular-nums">
          {badge}
        </span>
      </div>
      <Link
        href={`/apps/${app.id}`}
        className="focus-ring mt-4 rounded-control after:absolute after:inset-0 after:rounded-3xl"
      >
        <span className="block text-lg font-bold text-ink wrap-anywhere">{app.title}</span>
        <span className="mt-1 line-clamp-2 block text-sm text-slate-800">{app.tagline}</span>
        <Meta app={app} showCategory={showCategory} />
      </Link>
      <div className="relative z-10 mt-auto pt-4">
        <GetLink app={app} className="bg-surface/80 text-ink hover:bg-surface" />
      </div>
    </article>
  );
}

function Row({
  app,
  rank,
  showCategory,
}: {
  app: AppSummary;
  rank: number | null;
  showCategory: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-2 sm:gap-4">
      {rank !== null && (
        <span className="w-6 shrink-0 text-center text-sm font-semibold text-slate-500 tabular-nums">
          {rank}
        </span>
      )}
      <Link
        href={`/apps/${app.id}`}
        className={cx(
          "focus-ring -m-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 hover:bg-slate-100 sm:gap-4",
          PRESS,
        )}
      >
        <AppIcon app={app} size="md" />
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{app.title}</span>
          <span className="block truncate text-sm text-slate-600">{app.tagline}</span>
          <Meta app={app} showCategory={showCategory} />
        </span>
      </Link>
      <GetLink app={app} className="shrink-0" />
    </div>
  );
}
