import type { Metadata } from "next";
import { TextLink } from "@/components/ui/TextLink";
import { NotADeveloper, requireUser } from "../../access";
import { AppForm } from "../AppForm";

export const metadata: Metadata = { title: "Publish an app", robots: { index: false } };

export default async function NewAppPage() {
  const user = await requireUser("/dashboard/apps/new");
  if (user.role !== "developer") return <NotADeveloper user={user} />;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <TextLink href="/dashboard" className="text-sm">
        Back to dashboard
      </TextLink>
      <h1 className="mt-3 text-3xl font-semibold">Publish an app</h1>
      <p className="mt-1 text-muted">It’s listed as soon as you publish it.</p>
      <AppForm />
    </div>
  );
}
