import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import { AppIcon } from "@/components/AppCard";
import { ListNotice, Pagination, PastTheEnd } from "@/components/Pagination";
import { CategoryIcon, Confetti, Mascot } from "@/components/store/art";
import { DownloadLink } from "@/components/store/DownloadLink";
import { GetLink, INK_BUTTON, PRESS, Rating, WASHES } from "@/components/store/parts";
import { publishHrefFor, StoreShell } from "@/components/store/StoreShell";
import { StarRating } from "@/components/ui/StarRating";
import { ApiError, serverFetch } from "@/lib/api/server";
import type { AppDetail, AppSummary, ReviewPage } from "@/lib/api/types";
import { fetchApps, parsePage } from "@/lib/browse";
import { categoryHref } from "@/lib/categories";
import { cx } from "@/lib/cx";
import { formatCompact, formatCount, formatDay } from "@/lib/format";
import { withNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";
import { ReviewForm } from "./ReviewForm";

const MAX_INT4 = 2_147_483_647;
/** Apps in the "More in this category" card. */
const SIMILAR = 4;

/** `:id` as the backend accepts it, or null: anything else would be a 400, shown as the 404 page. */
function parseAppId(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_INT4 ? id : null;
}

/** null for 404; any other failure throws. */
async function orNotFound<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// Once per request, shared by generateMetadata and the page.
const getApp = cache((id: number) => orNotFound(serverFetch<AppDetail>(`/api/apps/${id}`)));

export async function generateMetadata({ params }: PageProps<"/apps/[id]">): Promise<Metadata> {
  const id = parseAppId((await params).id);
  const app = id === null ? null : await getApp(id);
  if (!app) notFound();
  return { title: app.title, description: app.tagline };
}

/**
 * One app, in the store's frame: a washed banner with the Download link, its numbers, what it is,
 * and its reviews, with its details and more from its category beside them. Reviews come through
 * serverFetch, which forwards the session cookie, so `mine` is the viewer's own review.
 */
export default async function AppPage({ params, searchParams }: PageProps<"/apps/[id]">) {
  const id = parseAppId((await params).id);
  if (id === null) notFound();
  const page = parsePage((await searchParams).page);
  const [app, reviews, user] = await Promise.all([
    getApp(id),
    orNotFound(serverFetch<ReviewPage>(`/api/apps/${id}/reviews?page=${page}`)),
    getCurrentUser(),
  ]);
  if (!app || !reviews) notFound();
  // One more than shown, so the list is still full once this app is left out.
  const similar = (
    await fetchApps({ sort: "popular", category: app.category, pageSize: SIMILAR + 1 })
  ).items
    .filter((other) => other.id !== app.id)
    .slice(0, SIMILAR);

  const self = `/apps/${app.id}`;
  const totalPages = Math.ceil(reviews.total / reviews.pageSize);
  const reviewsHref = (n: number) =>
    `${self}${n > 1 ? `?${new URLSearchParams({ page: String(n) })}` : ""}#reviews`;

  return (
    <StoreShell active={app.category} publishHref={publishHrefFor(user)}>
      <article className="flex flex-col gap-8 lg:gap-10">
        <header
          className={cx(
            "relative grid overflow-hidden rounded-[2rem] bg-linear-to-br p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_15rem]",
            WASHES[app.id % WASHES.length],
          )}
        >
          <div className="relative z-10 flex min-w-0 flex-col items-start">
            <Link
              href={categoryHref(app.category)}
              className={cx(
                "focus-ring inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1 text-sm font-semibold text-ink hover:bg-surface",
                PRESS,
              )}
            >
              <CategoryIcon category={app.category} className="size-4" />
              {app.category}
            </Link>
            <div className="mt-5 flex min-w-0 items-center gap-4 sm:gap-5">
              <AppIcon app={app} size="xl" />
              <div className="min-w-0">
                <h1 className="text-3xl font-bold tracking-tight text-ink wrap-anywhere sm:text-4xl">
                  {app.title}
                </h1>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  by <span className="wrap-anywhere">{app.developer_username}</span>
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-lg text-base text-slate-800 wrap-break-word sm:text-lg">
              {app.tagline}
            </p>
            <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              {/*
                A plain link the person clicks: never next/link (it would prefetch), no `download`
                attribute (the signed URL's Content-Disposition names the file), no fetch. Every
                GET counts a download (INV-3), so nothing but that click may request it; the count
                shows the new total on the next load. DownloadLink only dims it meanwhile.
              */}
              <DownloadLink appId={app.id} className={INK_BUTTON}>
                Download
              </DownloadLink>
              <Link
                href="#reviews"
                className={cx(
                  "focus-ring inline-flex h-11 items-center justify-center rounded-full bg-surface/70 px-6 font-semibold text-ink hover:bg-surface",
                  PRESS,
                )}
              >
                Ratings & reviews
              </Link>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-700">Free · Version {app.version}</p>
          </div>
          <div aria-hidden="true" className="pointer-events-none relative hidden md:block">
            <Confetti className="absolute inset-0 m-auto w-full" />
            <div className="absolute top-[42%] left-[38%] -translate-x-1/2 -translate-y-1/2 rotate-[-8deg]">
              <div className="scale-[1.6] drop-shadow-xl">
                <AppIcon app={app} size="lg" />
              </div>
            </div>
            <Mascot className="absolute right-0 -bottom-16 w-36" />
          </div>
        </header>

        {/* The numbers, as a strip of tiles. */}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat term="Rating">
            <StarRating value={app.avg_rating} />
          </Stat>
          <Stat term="Downloads">
            <span className="text-lg font-bold text-ink tabular-nums">
              {formatCount(app.download_count)}
            </span>
          </Stat>
          <Stat term="Version">
            <span className="text-lg font-bold text-ink wrap-anywhere">{app.version}</span>
          </Stat>
          <Stat term="Updated">
            <time dateTime={app.updated_at} className="text-lg font-bold text-ink">
              {formatDay(app.updated_at)}
            </time>
          </Stat>
        </dl>

        <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_18rem] xl:gap-6">
          <div className="flex min-w-0 flex-col gap-8">
            <section
              aria-labelledby="about-heading"
              className="rounded-3xl bg-surface p-6 shadow-card sm:p-8"
            >
              <h2 id="about-heading" className="text-xl font-semibold text-ink sm:text-2xl">
                About this app
              </h2>
              <p className="mt-4 leading-relaxed whitespace-pre-line text-slate-800 wrap-break-word">
                {app.description}
              </p>
            </section>

            <section
              id="reviews"
              aria-labelledby="reviews-heading"
              className="flex scroll-mt-24 flex-col gap-5"
            >
              <h2 id="reviews-heading" className="text-xl font-semibold text-ink sm:text-2xl">
                Ratings & reviews
              </h2>

              <div className="flex flex-col gap-5 rounded-3xl bg-linear-to-br from-green-100 via-surface to-cyan-100 p-6 shadow-card sm:flex-row sm:items-center sm:p-8">
                <p className="text-6xl font-bold tracking-tight text-ink tabular-nums">
                  {app.avg_rating === null ? "–" : app.avg_rating.toFixed(1)}
                  <span className="sr-only"> average</span>
                </p>
                <div>
                  <StarRating
                    value={app.avg_rating}
                    reviewCount={app.review_count}
                    className="text-lg"
                  />
                  <p className="mt-1 text-sm text-slate-600">
                    {app.review_count === 1
                      ? "From 1 review"
                      : `From ${formatCount(app.review_count)} reviews`}
                  </p>
                </div>
              </div>

              {!user ? (
                <div className="flex flex-col items-start gap-3 rounded-3xl bg-surface p-6 shadow-card sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-base text-slate-700">
                    Tried {app.title}? Tell others what you think.
                  </p>
                  <Link href={withNext("/sign-in", self)} className={INK_BUTTON}>
                    Sign in to review
                  </Link>
                </div>
              ) : user.id === app.developer_id ? (
                <p className="rounded-3xl bg-surface p-6 text-base text-slate-700 shadow-card">
                  You published this app, so you can’t review it.
                </p>
              ) : (
                <ReviewForm appId={app.id} mine={reviews.mine} />
              )}

              {reviews.total === 0 ? (
                <ListNotice title="No reviews yet." className="rounded-3xl bg-surface" />
              ) : reviews.items.length === 0 ? (
                <PastTheEnd firstPageHref={reviewsHref(1)} />
              ) : (
                <div>
                  <ul className="flex flex-col gap-3">
                    {reviews.items.map((review) => (
                      <li key={review.id} className="rounded-3xl bg-surface p-5 shadow-card sm:p-6">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-green-200 text-sm font-semibold text-green-900"
                          >
                            {Array.from(review.username)[0]?.toUpperCase()}
                          </span>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-semibold text-ink wrap-anywhere">
                              {review.username}
                            </span>
                            {reviews.mine?.id === review.id && (
                              // ink on accent is 7.4:1; never white.
                              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-ink">
                                Your review
                              </span>
                            )}
                            <time
                              dateTime={review.created_at}
                              className="ml-auto text-sm text-slate-600"
                            >
                              {formatDay(review.created_at)}
                            </time>
                          </div>
                        </div>
                        <StarRating value={review.rating} className="mt-3" />
                        {review.comment && (
                          <p className="mt-2 whitespace-pre-line text-slate-800 wrap-break-word">
                            {review.comment}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <Pagination page={reviews.page} totalPages={totalPages} hrefFor={reviewsHref} />
                </div>
              )}
            </section>
          </div>

          <aside className="flex flex-col gap-6 xl:self-start">
            <section
              aria-labelledby="info-heading"
              className="rounded-3xl bg-surface p-6 shadow-card"
            >
              <h2 id="info-heading" className="text-lg font-semibold text-ink">
                Information
              </h2>
              <dl className="mt-4 flex flex-col gap-3 text-sm">
                <Info term="Developer">
                  <span className="wrap-anywhere">{app.developer_username}</span>
                </Info>
                <Info term="Category">
                  <Link
                    href={categoryHref(app.category)}
                    className="focus-ring rounded-control font-semibold text-green-700 hover:text-green-800"
                  >
                    {app.category}
                  </Link>
                </Info>
                <Info term="Released">
                  <time dateTime={app.created_at}>{formatDay(app.created_at)}</time>
                </Info>
                <Info term="Price">Free</Info>
              </dl>
            </section>
            <Similar category={app.category} apps={similar} />
          </aside>
        </div>
      </article>
    </StoreShell>
  );
}

function Stat({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-2xl bg-surface p-4 shadow-card">
      <dt className="text-sm font-medium text-slate-600">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Info({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-slate-600">{term}</dt>
      <dd className="min-w-0 text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

/** A few more apps from the same category, each with its own Get button. */
function Similar({ category, apps }: { category: AppDetail["category"]; apps: AppSummary[] }) {
  if (apps.length === 0) return null;
  return (
    <section aria-labelledby="similar-heading" className="rounded-3xl bg-surface p-6 shadow-card">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="similar-heading" className="text-lg font-semibold text-ink">
          More in {category}
        </h2>
        <Link
          href={categoryHref(category)}
          className="focus-ring shrink-0 rounded-control text-sm font-semibold text-green-700 hover:text-green-800"
        >
          See all<span className="sr-only">: {category}</span>
        </Link>
      </div>
      <ul className="mt-4 flex flex-col gap-1">
        {apps.map((other) => (
          <li key={other.id} className="flex items-center gap-3">
            <Link
              href={`/apps/${other.id}`}
              className={cx(
                "focus-ring -mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2 hover:bg-slate-100",
                PRESS,
              )}
            >
              <AppIcon app={other} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{other.title}</span>
                <span className="flex items-center gap-2 text-xs whitespace-nowrap text-slate-600">
                  <Rating app={other} />
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="size-3.5 fill-none stroke-current"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
                    </svg>
                    {formatCompact(other.download_count)}
                    <span className="sr-only"> downloads</span>
                  </span>
                </span>
              </span>
            </Link>
            <GetLink app={other} />
          </li>
        ))}
      </ul>
    </section>
  );
}
