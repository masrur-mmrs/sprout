import { AppGrid } from "@/components/AppCard";
import { BrowseList } from "@/components/BrowseList";
import { CategoryLinks } from "@/components/CategoryLinks";
import { fetchApps, parsePage, parseSort } from "@/lib/browse";

/** Featured, the categories, then every app. Past page 1 it's just the list. */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const sort = parseSort(params.sort);
  const page = parsePage(params.page);
  const firstPage = page === 1;
  const [list, featured] = await Promise.all([
    fetchApps({ sort, page }),
    firstPage ? fetchApps({ sort: "top-rated", pageSize: 3 }) : null,
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-14 px-4 py-10 sm:px-6 sm:py-14">
      {firstPage && (
        <>
          <section className="flex flex-col gap-3">
            <h1 className="text-4xl font-semibold sm:text-5xl">Indie apps, freshly grown.</h1>
            <p className="max-w-xl text-lg text-muted">
              Discover, download and review apps made by independent developers.
            </p>
          </section>

          {featured && featured.items.length > 0 && (
            <section aria-labelledby="featured-heading">
              <h2 id="featured-heading" className="mb-6 text-2xl font-semibold">
                Featured
              </h2>
              <AppGrid apps={featured.items} featured />
            </section>
          )}

          <section aria-labelledby="categories-heading">
            <h2 id="categories-heading" className="mb-4 text-2xl font-semibold">
              Browse by category
            </h2>
            <CategoryLinks />
          </section>
        </>
      )}

      <BrowseList
        title="All apps"
        headingLevel={firstPage ? "h2" : "h1"}
        path="/"
        sort={sort}
        data={list}
      />
    </div>
  );
}
