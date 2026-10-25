import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Page not found" };

/** Unknown URLs, and every notFound(): an unknown app, a bad id, a category slug that isn't one. */
export default function NotFound() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <h1 className="text-4xl font-semibold">Page not found</h1>
      <p className="max-w-xl text-lg text-muted">
        This page doesn’t exist, or the app it showed has been removed.
      </p>
      <Link href="/" className={buttonStyles("primary")}>
        Back to all apps
      </Link>
    </section>
  );
}
