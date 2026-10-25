import Image from "next/image";
import Link from "next/link";
import type { User } from "@/lib/api/types";
import { HeaderSearch } from "./HeaderSearch";
import { SignOutButton } from "./SignOutButton";
import { buttonStyles } from "./ui/Button";

/**
 * The app shell's header, rendered on the server with the user the root layout fetched. A
 * translucent layer that content scrolls under; solid when the user asks for less transparency or
 * more contrast. On narrow screens the search drops to its own row.
 */
export function Header({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-surface/80 backdrop-blur-xl backdrop-saturate-150 transparency-reduce:bg-surface transparency-reduce:backdrop-filter-none contrast-more:border-muted contrast-more:bg-surface contrast-more:backdrop-filter-none">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6">
        <Link href="/" className="focus-ring flex shrink-0 items-center gap-2 rounded-control">
          <Image src="/sprout.png" alt="Sprout" width={32} height={32} loading="eager" />
          {/* The image's alt already names the link. */}
          <span aria-hidden="true" className="hidden text-lg font-semibold sm:inline">
            Sprout
          </span>
        </Link>

        {/* A GET form to /search that works without JS; with JS, results follow the typing. */}
        <HeaderSearch />

        {/* Narrow screens: the nav keeps the logo's row and the username gives up width, so
            Dashboard and Sign out always fit. From sm up it takes its natural width, as the search
            flexes instead. */}
        <nav
          aria-label="Account"
          className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none"
        >
          {user ? (
            <>
              {user.role === "developer" && (
                <Link href="/dashboard" className={buttonStyles("ghost", "sm")}>
                  Dashboard
                </Link>
              )}
              <span className="max-w-40 min-w-0 truncate text-sm font-medium text-ink">
                {user.username}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/sign-in" className={buttonStyles("ghost", "sm")}>
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonStyles("primary", "sm")}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
