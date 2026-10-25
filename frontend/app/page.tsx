import { NavIcon } from "@/components/store/art";
import { BROWSE_LISTS } from "@/components/store/copy";
import { StoreList } from "@/components/store/StoreList";
import { publishHrefFor, StoreShell } from "@/components/store/StoreShell";
import { fetchApps, parsePage, parseSort } from "@/lib/browse";
import { categoryHref } from "@/lib/categories";
import { formatCompact } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { CHART_SIZE, loadStore } from "./_home/data";
import {
  CategoryGrid,
  ChartCard,
  FeaturedBanner,
  FreePromo,
  PublishPromo,
  TileRow,
} from "./_home/Store";

/** A games row needs this many to look like a row rather than a gap. */
const MIN_GAMES = 3;

/**
 * Bare `/` is the storefront: featured banner, charts, rows and categories beside the store's
 * sidebar. Any explicit `?sort=` or `?page=` is one of the browse lists (Top charts, New releases,
 * Top rated) of every app, with pagination; `?page=` alone is Top charts.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  if (params.sort !== undefined || params.page !== undefined) {
    const sort = parseSort(params.sort);
    const list = BROWSE_LISTS[sort];
    const [data, user] = await Promise.all([
      fetchApps({ sort, page: parsePage(params.page) }),
      getCurrentUser(),
    ]);
    return (
      <StoreShell active={list.key} publishHref={publishHrefFor(user)}>
        <StoreList
          title={list.title}
          kind="Charts"
          description={list.description}
          glyph={<NavIcon name={list.key} />}
          wash={list.wash}
          path="/"
          sort={sort}
          data={data}
        />
      </StoreShell>
    );
  }

  const [store, user] = await Promise.all([loadStore(), getCurrentUser()]);
  const publishHref = publishHrefFor(user);
  const games = store.shelves.find((shelf) => shelf.category === "Games");

  return (
    <StoreShell active="discover" publishHref={publishHref}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">Discover</h1>
        <p className="mt-1 text-base text-slate-600">
          {store.total === 1 ? "1 indie app" : `${formatCompact(store.total)} indie apps`}, free to
          download.
        </p>
      </div>

      <FeaturedBanner items={store.featured} />

      <ChartCard
        id="top-charts"
        title="Top charts"
        href="/?sort=popular"
        apps={store.popular.slice(0, CHART_SIZE)}
      />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:gap-6">
        {/* Games get their own row once there are enough of them to fill it. */}
        {games && games.apps.length >= MIN_GAMES ? (
          <TileRow
            id="games"
            title="Indie games"
            note="Play the community's favourites"
            href={categoryHref("Games")}
            apps={games.apps}
            wrap
          />
        ) : (
          <TileRow
            id="more-popular"
            title="More to explore"
            note="Popular picks just past the top charts"
            href="/?sort=popular"
            apps={store.popular.slice(CHART_SIZE, CHART_SIZE + 6)}
            wrap
          />
        )}
        <FreePromo total={store.total} />
      </div>

      <TileRow
        id="new"
        title="New releases"
        note="Fresh from independent developers"
        href="/?sort=new"
        apps={store.newest}
      />
      <TileRow
        id="top-rated"
        title="Top rated"
        note="The apps reviewers love most"
        href="/?sort=top-rated"
        apps={store.topRated}
      />

      <CategoryGrid shelves={store.shelves} />

      <PublishPromo publishHref={publishHref} />
    </StoreShell>
  );
}
