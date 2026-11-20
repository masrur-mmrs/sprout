import type { Metadata } from "next";
import { Confetti, Laptop, Mascot } from "@/components/store/art";
import { WASHES } from "@/components/store/parts";
import { TextLink } from "@/components/ui/TextLink";
import { cx } from "@/lib/cx";
import { NotADeveloper, requireUser } from "../../access";
import { AppForm } from "../AppForm";

export const metadata: Metadata = { title: "Publish an app", robots: { index: false } };

/**
 * Publishing, dressed like the storefront it feeds: a banner in the featured slides' wash, with
 * the mascot at its laptop, over the three-step form.
 */
export default async function NewAppPage() {
  const user = await requireUser("/dashboard/apps/new");
  if (user.role !== "developer") return <NotADeveloper user={user} />;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">
      <TextLink href="/dashboard" className="text-sm">
        Back to dashboard
      </TextLink>
      <div
        className={cx(
          "relative mt-4 grid overflow-hidden rounded-[2rem] bg-linear-to-br p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_17rem]",
          WASHES[1],
        )}
      >
        <div className="relative z-10 flex flex-col items-start justify-center">
          <p className="rounded-full bg-surface/70 px-3 py-1 text-sm font-semibold text-ink">
            Free for every developer
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink sm:text-5xl">
            Publish an app
          </h1>
          <p className="mt-3 max-w-md text-base text-slate-800">
            Plant it on Sprout. Say what it does, add your files, and it’s listed the moment you
            publish.
          </p>
        </div>
        <div aria-hidden="true" className="pointer-events-none relative hidden h-44 md:block">
          <Confetti className="absolute inset-0 h-full w-full" />
          <Laptop className="absolute bottom-0 left-0 w-40" />
          <Mascot wave className="absolute right-0 -bottom-12 w-32" />
        </div>
      </div>
      <AppForm />
    </div>
  );
}
