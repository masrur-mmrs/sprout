import Image from "next/image";
import Link from "next/link";
import type { User } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { HeaderSearch } from "./HeaderSearch";
import { HeaderTabs } from "./HeaderTabs";
import { SignOutButton } from "./SignOutButton";
import { buttonStyles } from "./ui/Button";

/** The store's controls are pills, like its tabs and search. */
const PILL = "rounded-full";

/**
 * The app shell's header, rendered on the server with the user the root layout fetched: the logo,
 * the store's segmented tabs, a pill search and the account. A translucent layer that content
 * scrolls under, with no hairline; solid, with an edge, when the user asks for less transparency or
 * more contrast. On narrow screens the search drops to its own row and the tabs give way to the
 * storefront's own chips.
 */
export function Header({ user }: { user: User | null }) {
  return (
    <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-xl backdrop-saturate-150 transparency-reduce:bg-surface transparency-reduce:backdrop-filter-none contrast-more:border-b contrast-more:border-muted contrast-more:bg-surface contrast-more:backdrop-filter-none">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6 sm:py-4">
        <Link href="/" className="focus-ring flex shrink-0 items-center gap-2 rounded-control">
          <Image src="/sprout.png" alt="Sprout" width={32} height={32} loading="eager" />
          {/* The image's alt already names the link. */}
          <span aria-hidden="true" className="hidden text-xl font-bold tracking-tight sm:inline">
            Sprout
          </span>
        </Link>

        <HeaderTabs />

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
                <Link href="/dashboard" className={cx(buttonStyles("ghost", "sm"), PILL)}>
                  Dashboard
                </Link>
              )}
              <SignOutButton />
              <span className="flex min-w-0 items-center gap-2 rounded-full bg-slate-100 py-1 pr-3 pl-1">
                {/* The avatar is the name's first letter, on the brand's lightest tint. */}
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-green-200 text-sm font-semibold text-green-900"
                >
                  {Array.from(user.username)[0]?.toUpperCase()}
                </span>
                <span className="max-w-32 min-w-0 truncate text-sm font-medium text-ink">
                  {user.username}
                </span>
              </span>
            </>
          ) : (
            <>
              <Link href="/sign-in" className={cx(buttonStyles("ghost", "sm"), PILL)}>
                Sign in
              </Link>
              <Link href="/sign-up" className={cx(buttonStyles("primary", "sm"), PILL)}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
