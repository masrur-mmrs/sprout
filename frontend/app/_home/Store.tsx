import Link from "next/link";
import { AppIcon } from "@/components/AppCard";
import type { AppSummary } from "@/lib/api/types";
import { categoryHref } from "@/lib/categories";
import { cx } from "@/lib/cx";
import { formatCompact } from "@/lib/format";
import { CategoryIcon, Confetti, Laptop, Mascot, Shapes } from "@/components/store/art";
import { DownloadLink } from "@/components/store/DownloadLink";
import { GetLink, INK_BUTTON, PRESS, Rating, WASHES } from "@/components/store/parts";
import { Carousel } from "./Carousel";
import type { CategoryShelf, Featured } from "./data";

function SectionHead({
  id,
  title,
  note,
  href,
}: {
  id: string;
  title: string;
  note?: string;
  href?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 id={id} className="text-xl font-semibold text-ink sm:text-2xl">
          {title}
        </h2>
        {note && <p className="mt-1 text-sm text-slate-600">{note}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="focus-ring shrink-0 rounded-control text-sm font-semibold text-green-700 hover:text-green-800"
        >
          See all<span className="sr-only">: {title}</span>
        </Link>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- featured banner */

function Slide({ item, index }: { item: Featured; index: number }) {
  const { app, label } = item;
  return (
    <article
      className={cx(
        "relative grid min-h-80 overflow-hidden bg-linear-to-br p-6 pb-20 sm:min-h-[22rem] sm:p-10 sm:pb-20 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]",
        WASHES[index % WASHES.length],
      )}
    >
      <div className="relative z-10 flex flex-col items-start justify-center">
        <p className="rounded-full bg-surface/70 px-3 py-1 text-sm font-semibold text-ink">
          {label}
        </p>
        <div className="mt-5 flex items-center gap-4">
          <AppIcon app={app} size="lg" />
          <div className="min-w-0">
            <h3 className="text-2xl font-bold tracking-tight text-ink wrap-anywhere sm:text-4xl">
              {app.title}
            </h3>
            <p className="mt-1 text-sm font-medium text-slate-700">{app.category}</p>
          </div>
        </div>
        <p className="mt-4 line-clamp-2 max-w-md text-base text-slate-800">{app.tagline}</p>
        <p className="mt-3 flex flex-wrap gap-x-3 text-sm font-medium text-slate-700">
          <Rating app={app} />
          <span aria-hidden="true">·</span>
          <span>{formatCompact(app.download_count)} downloads</span>
          <span aria-hidden="true">·</span>
          <span>Free</span>
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <DownloadLink appId={app.id} className={INK_BUTTON}>
            Get it free<span className="sr-only">: {app.title}</span>
          </DownloadLink>
          <Link
            href={`/apps/${app.id}`}
            className={cx(
              "focus-ring inline-flex h-11 items-center rounded-full bg-surface/70 px-6 font-semibold text-ink hover:bg-surface",
              PRESS,
            )}
          >
            Details<span className="sr-only">: {app.title}</span>
          </Link>
        </div>
      </div>

      {/* The art: the app's own icon, enlarged and tilted, with the mascot leaning on it. */}
      <div aria-hidden="true" className="pointer-events-none relative hidden md:block">
        <Confetti className="absolute inset-0 m-auto w-full max-w-sm" />
        <div className="absolute top-1/2 left-[38%] -translate-x-1/2 -translate-y-1/2 rotate-[-8deg]">
          <div className="origin-center scale-[2.1] drop-shadow-xl">
            <AppIcon app={app} size="lg" />
          </div>
        </div>
        <Mascot wave={index % 2 === 0} className="absolute right-0 bottom-[-4.5rem] w-44 lg:w-52" />
        <span className="absolute top-2 right-10 size-12 rounded-full bg-cyan-400/80" />
        <span className="absolute bottom-10 left-2 size-8 rotate-12 rounded-lg bg-surface/70" />
      </div>
    </article>
  );
}

export function FeaturedBanner({ items }: { items: Featured[] }) {
  if (items.length === 0) return null;
  return (
    <Carousel labels={items.map((item) => `${item.label}: ${item.app.title}`)}>
      {items.map((item, i) => (
        <Slide key={item.app.id} item={item} index={i} />
      ))}
    </Carousel>
  );
}

/* ---------------------------------------------------------------- lists */

/** Two columns of rows on a white card, each with a "Get" button: the store's chart. */
export function ChartCard({
  id,
  title,
  href,
  apps,
}: {
  id: string;
  title: string;
  href: string;
  apps: AppSummary[];
}) {
  if (apps.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <SectionHead id={id} title={title} href={href} />
      <ol className="grid grid-cols-1 gap-x-10 rounded-3xl bg-surface p-3 shadow-card sm:p-5 md:grid-cols-2">
        {apps.map((app, i) => (
          <li key={app.id} className="flex min-w-0 items-center gap-3 rounded-2xl p-2 sm:gap-4">
            <span className="w-5 shrink-0 text-center text-sm font-semibold text-slate-500 tabular-nums">
              {i + 1}
            </span>
            <Link
              href={`/apps/${app.id}`}
              className={cx(
                "focus-ring -m-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 hover:bg-slate-100 sm:gap-4",
                PRESS,
              )}
            >
              <AppIcon app={app} size="sm" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{app.title}</span>
                <span className="block truncate text-sm text-slate-600">{app.tagline}</span>
              </span>
            </Link>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <GetLink app={app} />
              <span className="text-xs text-slate-600 tabular-nums">
                {formatCompact(app.download_count)}
                <span className="sr-only"> downloads</span>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** An app as a tile in a row: icon on top, name and rating under it. */
function Tile({ app }: { app: AppSummary }) {
  return (
    <Link
      href={`/apps/${app.id}`}
      className={cx(
        "focus-ring group flex h-full flex-col rounded-2xl p-2 hover:bg-slate-100",
        PRESS,
      )}
    >
      <span className="block transition-transform duration-(--duration-spring) ease-(--ease-spring) motion-safe:group-hover:-translate-y-1">
        <AppIcon app={app} size="lg" />
      </span>
      <span className="mt-3 line-clamp-2 text-sm font-semibold text-ink">{app.title}</span>
      <span className="mt-1 flex items-center gap-2 text-xs text-slate-600">
        <Rating app={app} />
        <span aria-hidden="true">·</span>
        <span className="truncate">{app.category}</span>
      </span>
    </Link>
  );
}

/**
 * A row of tiles on a white card: swipeable on its own, or, with `wrap`, a grid that fills a
 * narrow column beside a promo on wide screens.
 */
export function TileRow({
  id,
  title,
  note,
  href,
  apps,
  wrap = false,
}: {
  id: string;
  title: string;
  note: string;
  href: string;
  apps: AppSummary[];
  wrap?: boolean;
}) {
  if (apps.length === 0) return null;
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-5 rounded-3xl bg-surface p-5 shadow-card sm:p-7"
    >
      <SectionHead id={id} title={title} note={note} href={href} />
      <ul
        className={cx(
          "-mx-2 flex min-w-0 snap-x gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          wrap && "xl:grid xl:grid-cols-3 xl:gap-y-3 xl:overflow-visible",
        )}
      >
        {apps.map((app) => (
          <li key={app.id} className={cx("w-28 shrink-0 snap-start sm:w-32", wrap && "xl:w-auto")}>
            <Tile app={app} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- promos */

/** The "everything is free" card that sits beside a row, like a store's seasonal promo. */
export function FreePromo({ total }: { total: number }) {
  return (
    <section
      aria-labelledby="promo-free"
      className="relative grid overflow-hidden rounded-3xl bg-linear-to-br from-surface via-cyan-50 to-green-100 p-6 shadow-card sm:p-7 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end xl:grid-cols-1"
    >
      <div className="flex flex-col">
        <h2 id="promo-free" className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Indie apps, all free, all in one place
        </h2>
        <p className="mt-3 max-w-xs text-base text-slate-700">
          {formatCompact(total)} apps from independent developers. Download anything, rate what you
          love.
        </p>
        <Link href="/?sort=popular" className={cx(INK_BUTTON, "mt-6 self-start")}>
          Browse every app
        </Link>
      </div>
      <div aria-hidden="true" className="relative mt-4 h-36 sm:h-40">
        <Laptop className="absolute bottom-0 left-0 w-36" />
        <Mascot className="absolute right-2 bottom-0 w-28" />
        <Confetti className="absolute inset-0 h-full w-full" />
      </div>
    </section>
  );
}

/** The closing card for developers, the second half of the store: publishing. */
export function PublishPromo({ publishHref }: { publishHref: string }) {
  return (
    <section
      aria-labelledby="promo-publish"
      className="relative grid items-center gap-6 overflow-hidden rounded-3xl bg-ink p-6 text-surface sm:p-10 md:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div>
        <h2 id="promo-publish" className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Built something? Plant it on Sprout.
        </h2>
        <p className="mt-3 max-w-lg text-base text-slate-300">
          Upload your app and its icon, and it is listed the moment it is live. Free for every
          developer, with downloads and reviews in your dashboard.
        </p>
        <Link
          href={publishHref}
          className={cx(
            "focus-ring mt-6 inline-flex h-11 items-center rounded-full bg-brand px-6 font-semibold text-ink hover:bg-green-400",
            PRESS,
          )}
        >
          Start publishing
        </Link>
      </div>
      <div aria-hidden="true" className="relative hidden h-44 w-80 md:block">
        <Shapes className="absolute right-0 bottom-0 w-44" />
        <Mascot wave className="absolute bottom-0 left-0 w-32" />
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- categories */

export function CategoryGrid({ shelves }: { shelves: CategoryShelf[] }) {
  return (
    <section aria-labelledby="categories" className="flex flex-col gap-4">
      <SectionHead id="categories" title="Browse by category" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {shelves.map(({ category, total, apps }) => (
          <li key={category}>
            <Link
              href={categoryHref(category)}
              className={cx(
                "focus-ring flex h-full flex-col rounded-2xl bg-surface p-4 shadow-card hover:shadow-overlay",
                PRESS,
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-green-100 text-green-800">
                <CategoryIcon category={category} />
              </span>
              <span className="mt-3 font-semibold text-ink">{category}</span>
              <span className="mt-0.5 text-sm text-slate-600">
                {total === 1 ? "1 app" : `${formatCompact(total)} apps`}
              </span>
              {apps.length > 0 && (
                <span aria-hidden="true" className="mt-3 flex -space-x-2">
                  {apps.map((app) => (
                    <span key={app.id} className="rounded-[22.5%] ring-2 ring-surface">
                      <AppIcon app={app} size="sm" />
                    </span>
                  ))}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
