import Image from "next/image";
import Link from "next/link";
import type { User } from "@/lib/api/types";
import { buttonStyles } from "./ui/Button";
import { Input } from "./ui/Input";

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

        {/* A plain GET form: works without JS. Phase 10 adds /search and live suggestions. */}
        <form
          action="/search"
          role="search"
          className="order-last w-full sm:order-none sm:max-w-md sm:flex-1"
        >
          <label htmlFor="site-search" className="sr-only">
            Search apps
          </label>
          <div className="relative">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 fill-none stroke-muted stroke-2"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4 4" />
            </svg>
            <Input
              id="site-search"
              type="search"
              name="q"
              maxLength={100}
              placeholder="Search apps"
              autoComplete="off"
              className="pl-9"
            />
          </div>
        </form>

        <nav aria-label="Account" className="ml-auto flex shrink-0 items-center gap-2">
          {user ? (
            <>
              {user.role === "developer" && (
                <Link href="/dashboard" className={buttonStyles("ghost", "sm")}>
                  Dashboard
                </Link>
              )}
              <span className="max-w-40 truncate text-sm font-medium text-ink">
                {user.username}
              </span>
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
