import "server-only";
import { CATEGORIES, type AppSummary, type Category } from "@/lib/api/types";
import { fetchApps } from "@/lib/browse";

/** Apps in each storefront row; the row's "See all" leads to the full list. */
const ROW_SIZE = 8;
/** Apps in the top-charts card; the popular list carries on past them. */
export const CHART_SIZE = 6;
/** Icons stacked on each category tile. */
const TILE_ICONS = 4;

export interface Featured {
  label: string;
  app: AppSummary;
}

export interface CategoryShelf {
  category: Category;
  total: number;
  apps: AppSummary[];
}

export interface StoreData {
  total: number;
  featured: Featured[];
  popular: AppSummary[];
  newest: AppSummary[];
  topRated: AppSummary[];
  shelves: CategoryShelf[];
}

/** Everything the storefront shows, in one round of parallel requests to the backend. */
export async function loadStore(): Promise<StoreData> {
  const [popular, newest, topRated, ...byCategory] = await Promise.all([
    fetchApps({ sort: "popular", pageSize: CHART_SIZE + ROW_SIZE }),
    fetchApps({ sort: "new", pageSize: ROW_SIZE }),
    fetchApps({ sort: "top-rated", pageSize: ROW_SIZE }),
    ...CATEGORIES.map((category) => fetchApps({ sort: "popular", pageSize: TILE_ICONS, category })),
  ]);

  // The same app can lead two lists; each is featured once, under its first label.
  const seen = new Set<number>();
  const featured: Featured[] = [];
  for (const [label, app] of [
    ["Most downloaded", popular.items[0]],
    ["Newest on Sprout", newest.items[0]],
    ["Top rated", topRated.items[0]],
  ] as const) {
    if (app && !seen.has(app.id)) {
      seen.add(app.id);
      featured.push({ label, app });
    }
  }

  return {
    total: popular.total,
    featured,
    popular: popular.items,
    newest: newest.items,
    topRated: topRated.items,
    shelves: CATEGORIES.map((category, i) => ({
      category,
      total: byCategory[i].total,
      apps: byCategory[i].items,
    })),
  };
}
