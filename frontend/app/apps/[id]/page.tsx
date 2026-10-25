import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AppIcon } from "@/components/AppCard";
import { ListNotice, Pagination, PastTheEnd } from "@/components/Pagination";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StarRating } from "@/components/ui/StarRating";
import { TextLink } from "@/components/ui/TextLink";
import { ApiError, serverFetch } from "@/lib/api/server";
import type { AppDetail, ReviewPage } from "@/lib/api/types";
import { parsePage } from "@/lib/browse";
import { categoryHref } from "@/lib/categories";
import { formatCount, formatDay } from "@/lib/format";
import { withNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";
import { ReviewForm } from "./ReviewForm";

const MAX_INT4 = 2_147_483_647;

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
 * One app: what it is, the Download link, and its reviews. Reviews come through serverFetch, which
 * forwards the session cookie, so `mine` is the viewer's own review.
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

  const self = `/apps/${app.id}`;
  const totalPages = Math.ceil(reviews.total / reviews.pageSize);
  const reviewsHref = (n: number) =>
    `${self}${n > 1 ? `?${new URLSearchParams({ page: String(n) })}` : ""}#reviews`;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-5 sm:gap-x-6">
        <div className="sm:row-span-2">
          <AppIcon app={app} size="xl" />
        </div>
        <div className="min-w-0 self-center">
          <h1 className="text-2xl font-semibold wrap-anywhere sm:text-3xl">{app.title}</h1>
          <p className="mt-1 text-muted wrap-break-word sm:text-lg">{app.tagline}</p>
          <p className="mt-2 text-sm text-muted">
            <span className="font-medium text-ink wrap-anywhere">{app.developer_username}</span>
            <span aria-hidden="true"> · </span>
            <TextLink href={categoryHref(app.category)}>{app.category}</TextLink>
          </p>
        </div>
        {/* Full width on a phone, its own width beside the icon from sm up. */}
        <div className="col-span-2 flex flex-col sm:col-span-1 sm:col-start-2 sm:flex-row">
          {/*
            A plain link the person clicks: never next/link (it would prefetch), no `download`
            attribute (the signed URL's Content-Disposition names the file), no fetch. Every GET
            counts a download (INV-3), so nothing but that click may request it; the count shows
            the new total on the next load.
          */}
          <a
            href={`/api/apps/${app.id}/download`}
            rel="nofollow"
            className={buttonStyles("primary")}
          >
            Download
          </a>
        </div>
      </header>

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-slate-200 bg-slate-200 sm:grid-cols-3">
        <div className="col-span-2 bg-surface px-4 py-3 sm:col-span-1">
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">Rating</dt>
          <dd className="mt-1">
            <StarRating value={app.avg_rating} reviewCount={app.review_count} />
          </dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">Downloads</dt>
          <dd className="mt-1 font-semibold tabular-nums">{formatCount(app.download_count)}</dd>
        </div>
        <div className="bg-surface px-4 py-3">
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">Version</dt>
          <dd className="mt-1 font-semibold wrap-anywhere">{app.version}</dd>
        </div>
      </dl>

      <section aria-labelledby="about-heading" className="mt-10">
        <h2 id="about-heading" className="text-xl font-semibold">
          About this app
        </h2>
        <p className="mt-3 leading-relaxed whitespace-pre-line wrap-break-word">
          {app.description}
        </p>
      </section>

      <section id="reviews" aria-labelledby="reviews-heading" className="mt-12 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 id="reviews-heading" className="text-xl font-semibold">
            Ratings & reviews
          </h2>
          <StarRating value={app.avg_rating} reviewCount={app.review_count} />
        </div>

        <div className="mt-5">
          {!user ? (
            <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">Tried {app.title}? Tell others what you think.</p>
              <Link href={withNext("/sign-in", self)} className={buttonStyles("secondary", "sm")}>
                Sign in to review
              </Link>
            </Card>
          ) : user.id === app.developer_id ? (
            <p className="text-sm text-muted">You published this app, so you can’t review it.</p>
          ) : (
            <ReviewForm appId={app.id} mine={reviews.mine} />
          )}
        </div>

        <div className="mt-8">
          {reviews.total === 0 ? (
            <ListNotice title="No reviews yet." />
          ) : reviews.items.length === 0 ? (
            <PastTheEnd firstPageHref={reviewsHref(1)} />
          ) : (
            <>
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {reviews.items.map((review) => (
                  <li key={review.id} className="py-5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-ink wrap-anywhere">{review.username}</span>
                      {reviews.mine?.id === review.id && (
                        // ink on accent is 7.4:1; never white.
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-ink">
                          Your review
                        </span>
                      )}
                      <time dateTime={review.created_at} className="ml-auto text-sm text-muted">
                        {formatDay(review.created_at)}
                      </time>
                    </div>
                    <StarRating value={review.rating} className="mt-1.5" />
                    {review.comment && (
                      <p className="mt-2 whitespace-pre-line wrap-break-word">{review.comment}</p>
                    )}
                  </li>
                ))}
              </ul>
              <Pagination page={reviews.page} totalPages={totalPages} hrefFor={reviewsHref} />
            </>
          )}
        </div>
      </section>
    </article>
  );
}
