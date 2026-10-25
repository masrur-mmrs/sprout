"use client";

import Form from "next/form";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
} from "react";
import { MAX_SEARCH_LENGTH } from "@/lib/api/types";
import { cx } from "@/lib/cx";
import { Input } from "./ui/Input";

/** After the last keystroke: long enough to skip the letters of a word, short enough to feel live. */
const DEBOUNCE_MS = 250;

const FORM_CLASS = "order-last w-full sm:order-none sm:ml-auto sm:max-w-sm sm:flex-1";

function searchHref(q: string): string {
  return `/search?${new URLSearchParams({ q })}`;
}

/** Where the field's icon sits, and how it fades. */
const ICON_SLOT =
  "pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 transition-opacity duration-(--duration-fast) ease-out";
const STROKE = "fill-none stroke-muted stroke-2";
// Results that land within --duration-fast never show the spinner; it leaves without waiting.
const ICON_DELAY = "delay-(--duration-fast)";

/** `pending`: results are loading, so the magnifier turns into a spinner in the same spot. */
function SearchField({
  pending = false,
  ...props
}: ComponentProps<"input"> & { pending?: boolean }) {
  return (
    <>
      <label htmlFor="site-search" className="sr-only">
        Search apps
      </label>
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={cx(ICON_SLOT, STROKE, pending && cx("opacity-0", ICON_DELAY))}
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
        {/* The slot fades and the arc animates, so the reduced-motion pulse (an opacity keyframe)
            can't override the fade; the arc only animates while results load. */}
        <span aria-hidden="true" className={cx(ICON_SLOT, pending ? ICON_DELAY : "opacity-0")}>
          <svg
            viewBox="0 0 24 24"
            className={cx(
              "block size-full",
              STROKE,
              pending && "motion-safe:animate-spin motion-reduce:animate-pulse",
            )}
            strokeLinecap="round"
          >
            {/* A three-quarter arc: 0.75 of the circumference (2π · 8 ≈ 50.3). */}
            <circle cx="12" cy="12" r="8" strokeDasharray="37.7 50.3" />
          </svg>
        </span>
        <Input
          id="site-search"
          type="search"
          name="q"
          maxLength={MAX_SEARCH_LENGTH}
          placeholder="Search apps"
          autoComplete="off"
          // A pill, like the store's tabs; the muted edge still gives the field its 3:1 outline.
          className="h-10 rounded-full pl-10"
          {...props}
        />
      </div>
    </>
  );
}

/**
 * The header's search: a GET form to /search, so it works without JS. With JS, results follow the
 * typing: from any other page the first pause pushes /search (so Back returns there), and on
 * /search each pause replaces the entry, so one search is one history entry. It lives in the root
 * layout, so it's never remounted and keeps focus while results update.
 */
export function HeaderSearch() {
  return (
    // useSearchParams needs a boundary in case a page is ever prerendered; the plain form stands in.
    <Suspense
      fallback={
        <form action="/search" role="search" className={FORM_CLASS}>
          <SearchField />
        </form>
      }
    >
      <LiveSearch />
    </Suspense>
  );
}

function LiveSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onSearch = pathname === "/search";
  // A repeated q counts as none, as on the page.
  const all = searchParams.getAll("q");
  const urlQuery = all.length === 1 ? all[0] : "";

  // On /search the input starts as q; elsewhere it's left as typed.
  const [value, setValue] = useState(onSearch ? urlQuery : "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The route as of the last render, for the timer, which outlives the render that set it.
  const route = useRef({ onSearch, query: urlQuery.trim() });
  // A push to /search is loading. Until it lands, the newest value waits here: a replace now could
  // overwrite the page being left, and a second push would add a history entry.
  const pushing = useRef(false);
  const queued = useRef<string | null>(null);
  // Pending until the results being navigated to have rendered: drives the field's spinner.
  const [isPending, startTransition] = useTransition();

  const navigate = useCallback(
    (raw: string) => {
      clearTimeout(timer.current);
      if (pushing.current) {
        queued.current = raw;
        return;
      }
      const q = raw.trim();
      const { onSearch, query } = route.current;
      if (!onSearch) {
        // Clearing the input anywhere else does nothing.
        if (!q) return;
        pushing.current = true;
        startTransition(() => router.push(searchHref(q)));
      } else if (q !== query) {
        startTransition(() => router.replace(q ? searchHref(q) : "/search"));
      }
    },
    [router],
  );

  useEffect(() => {
    route.current = { onSearch, query: urlQuery.trim() };
  }, [onSearch, urlQuery]);

  // The push landed: catch up with what was typed meanwhile. If the user went elsewhere first,
  // that navigation wins and the queued value is dropped.
  useEffect(() => {
    if (!pushing.current) return;
    pushing.current = false;
    const next = queued.current;
    queued.current = null;
    if (next !== null && pathname === "/search") navigate(next);
  }, [pathname, navigate]);

  // Back and Forward: on /search the input shows the q being returned to, and nothing typed before
  // fires afterwards. Only history moves do this, so a landing search never overwrites newer typing.
  useEffect(() => {
    function onPopState() {
      clearTimeout(timer.current);
      pushing.current = false;
      queued.current = null;
      const url = new URL(window.location.href);
      if (url.pathname !== "/search") return;
      const qs = url.searchParams.getAll("q");
      setValue(qs.length === 1 ? qs[0] : "");
    }
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      clearTimeout(timer.current);
    };
  }, []);

  function onChange(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
  }

  // Enter: at once, by the same rules. next/form prefetches /search; JS takes the submit over.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(value);
  }

  return (
    <Form action="/search" role="search" onSubmit={onSubmit} className={FORM_CLASS}>
      <SearchField
        value={value}
        pending={isPending}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Form>
  );
}
