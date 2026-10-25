import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppGrid } from "@/components/AppCard";
import { CategoryLinks } from "@/components/CategoryLinks";
import { ApiError, serverFetch } from "@/lib/api/server";
import { MAX_SEARCH_LENGTH, type SearchResult } from "@/lib/api/types";
import { fetchApps, singleParam } from "@/lib/browse";

export const metadata: Metadata = { title: "Search", robots: { index: false } };

const TOO_LONG = `Use at most ${MAX_SEARCH_LENGTH} characters.`;

/** The backend's matches, closest first (at most 12), or null for a q it refuses (a NUL, say). */
async function search(q: string): Promise<SearchResult[] | null> {
  try {
    return await serverFetch<SearchResult[]>(`/api/apps/search?${new URLSearchParams({ q })}`);
  } catch (err) {
    if (err instanceof ApiError && err.code === "VALIDATION_ERROR") return null;
    throw err;
  }
}

/**
 * Server-rendered results for `?q=`, which the header's search navigates to as you type. `q` is
 * only ever rendered as text. The empty and no-result states point somewhere useful instead.
 */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const q = (singleParam((await searchParams).q) ?? "").trim();

  if (!q) {
    return (
      <Shell title="Search">
        <p className="mt-2 text-muted">Find apps by name, or by what they do.</p>
        <Suggestions />
      </Shell>
    );
  }

  // Not sent: the backend would refuse it with a 400.
  const results = q.length > MAX_SEARCH_LENGTH ? null : await search(q);
  if (!results) {
    return (
      <Shell title="Search">
        <p role="alert" className="mt-2 text-red-700">
          {TOO_LONG}
        </p>
        <Suggestions />
      </Shell>
    );
  }

  if (results.length === 0) {
    return (
      <Shell
        title={
          <>
            No results for “<bdi>{q}</bdi>”
          </>
        }
      >
        <p className="mt-2 max-w-xl text-muted">
          Check the spelling, or try fewer words. Searches under 3 characters only match the start
          of an app’s name.
        </p>
        <Suggestions />
      </Shell>
    );
  }

  return (
    <Shell
      title={
        <>
          Results for “<bdi>{q}</bdi>”
        </>
      }
    >
      <div className="mt-6">
        <AppGrid apps={results} />
      </div>
    </Shell>
  );
}

/** The query sits in <bdi>, so right-to-left text or bidi controls in it can't reorder the quotes. */
function Shell({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold wrap-anywhere">{title}</h1>
      {children}
    </div>
  );
}

/** Somewhere to go instead: the six most downloaded apps, and every category. */
async function Suggestions() {
  const popular = await fetchApps({ sort: "popular", pageSize: 6 });
  return (
    <div className="mt-10 flex flex-col gap-12">
      {popular.items.length > 0 && (
        <section aria-labelledby="popular-heading">
          <h2 id="popular-heading" className="mb-6 text-2xl font-semibold">
            Popular right now
          </h2>
          <AppGrid apps={popular.items} />
        </section>
      )}
      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="mb-4 text-2xl font-semibold">
          Browse by category
        </h2>
        <CategoryLinks />
      </section>
    </div>
  );
}
