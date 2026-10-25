import "server-only";
import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonStyles } from "@/components/ui/Button";
import type { User } from "@/lib/api/types";
import { withNext } from "@/lib/safe-next";
import { getCurrentUser } from "@/lib/session";

/**
 * The viewer of the dashboard page at `path`. proxy.ts only checks that a cookie exists, so a stale
 * or forged one gets this far: with no user behind it, go to sign-in and come back after. Each page
 * calls this itself (a layout doesn't re-render on navigation). A UX gate only: the backend checks
 * the role on every call, and ownership in SQL.
 */
export async function requireUser(path: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(withNext("/sign-in", path));
  return user;
}

/** What a signed-in `user` sees instead of the dashboard: why, and where to go instead. */
export function NotADeveloper({ user }: { user: User }) {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-24 sm:px-6">
      <h1 className="text-4xl font-semibold">Publishing needs a developer account</h1>
      <p className="max-w-xl text-lg text-muted">
        Publishing apps needs a developer account. You’re signed in as{" "}
        <span className="font-medium text-ink wrap-anywhere">{user.username}</span>, which can
        browse, download and review.
      </p>
      <Link href="/" className={buttonStyles("primary")}>
        Browse apps
      </Link>
    </section>
  );
}
