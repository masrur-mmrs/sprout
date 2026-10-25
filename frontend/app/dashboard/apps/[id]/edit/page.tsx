import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TextLink } from "@/components/ui/TextLink";
import { ApiError, serverFetch } from "@/lib/api/server";
import type { AppDetail } from "@/lib/api/types";
import { NotADeveloper, requireUser } from "../../../access";
import { AppForm } from "../../AppForm";
import { DeleteApp } from "../../DeleteApp";

export const metadata: Metadata = { title: "Edit app", robots: { index: false } };

const MAX_INT4 = 2_147_483_647;

/** `:id` as the backend accepts it, or null: anything else is the 404 page. */
function parseAppId(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= MAX_INT4 ? id : null;
}

/** null for 404; any other failure throws. */
async function fetchApp(id: number): Promise<AppDetail | null> {
  try {
    return await serverFetch<AppDetail>(`/api/apps/${id}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * Edit or delete one of the viewer's apps. Another developer's app is the 404 page, as the backend
 * answers 404 to their writes: whether it exists isn't this viewer's business.
 */
export default async function EditAppPage({ params }: PageProps<"/dashboard/apps/[id]/edit">) {
  const id = parseAppId((await params).id);
  if (id === null) notFound();
  const user = await requireUser(`/dashboard/apps/${id}/edit`);
  if (user.role !== "developer") return <NotADeveloper user={user} />;
  const app = await fetchApp(id);
  if (!app || app.developer_id !== user.id) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <TextLink href="/dashboard" className="text-sm">
        Back to dashboard
      </TextLink>
      <h1 className="mt-3 text-3xl font-semibold">Edit app</h1>
      <p className="mt-1 text-muted">
        Changes to <span className="font-medium text-ink wrap-anywhere">{app.title}</span> go live
        when you save them.
      </p>
      <AppForm app={app} />
      <DeleteApp appId={app.id} title={app.title} />
    </div>
  );
}
