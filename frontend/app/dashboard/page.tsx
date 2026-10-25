import type { Metadata } from "next";
import Link from "next/link";
import { AppIcon } from "@/components/AppCard";
import { buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StarRating } from "@/components/ui/StarRating";
import { ApiError, serverFetch } from "@/lib/api/server";
import type { DeveloperApp } from "@/lib/api/types";
import { formatCount, formatDay } from "@/lib/format";
import { NotADeveloper, requireUser } from "./access";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

/** The backend's 403 means the role changed since `/me`; it has the last word. */
async function fetchMyApps(): Promise<DeveloperApp[] | null> {
  try {
    return await serverFetch<DeveloperApp[]>("/api/developer/apps");
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) return null;
    throw err;
  }
}

/** A developer's apps, most recently updated first (the backend's order), each with its stats. */
export default async function DashboardPage() {
  const user = await requireUser("/dashboard");
  // A `user` never reaches the developer API from here.
  if (user.role !== "developer") return <NotADeveloper user={user} />;
  const apps = await fetchMyApps();
  if (!apps) return <NotADeveloper user={user} />;

  const publish = (
    <Link href="/dashboard/apps/new" className={buttonStyles("primary")}>
      Publish an app
    </Link>
  );

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-muted">Your apps, most recently updated first.</p>
        </div>
        {apps.length > 0 && publish}
      </div>

      {apps.length === 0 ? (
        <Card className="mt-8 flex flex-col items-start gap-4 sm:p-6">
          <p className="text-lg font-medium">You haven’t published an app yet.</p>
          {publish}
        </Card>
      ) : (
        <ul className="mt-8 divide-y divide-slate-200 overflow-hidden rounded-card border border-slate-200 bg-surface shadow-card">
          {apps.map((app) => (
            <li
              key={app.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-5"
            >
              <AppIcon app={app} size="sm" />
              <div className="min-w-0">
                <h2 className="font-semibold wrap-anywhere">{app.title}</h2>
                <p className="text-sm text-muted">
                  <span className="wrap-anywhere">Version {app.version}</span>
                  <span aria-hidden="true"> · </span>
                  {app.category}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <StarRating value={app.avg_rating} reviewCount={app.review_count} />
                  <span>
                    <span className="tabular-nums">{formatCount(app.download_count)}</span>{" "}
                    {app.download_count === 1 ? "download" : "downloads"}
                  </span>
                  <span>
                    Updated <time dateTime={app.updated_at}>{formatDay(app.updated_at)}</time>
                  </span>
                </div>
              </div>
              {/* Under the text on a phone, at the end of the row from sm up. "View" opens the
                  detail page, never /download (INV-3). */}
              <div className="col-start-2 flex gap-2 sm:col-start-3">
                <Link href={`/apps/${app.id}`} className={buttonStyles("secondary", "sm")}>
                  View<span className="sr-only"> {app.title}</span>
                </Link>
                <Link
                  href={`/dashboard/apps/${app.id}/edit`}
                  className={buttonStyles("secondary", "sm")}
                >
                  Edit<span className="sr-only"> {app.title}</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
