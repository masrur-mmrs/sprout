import { serverFetch } from "./api/server";
import { APP_SORTS, MAX_PAGE, type AppPage, type AppSort, type Category } from "./api/types";

/** Cards per browse page: 12 fills a 3-, 2- or 1-column grid evenly. */
export const BROWSE_PAGE_SIZE = 12;

// Pages normalize every query param before it reaches the backend, which answers anything else
// with a 400 that would surface as a 500 page.

/** A query param that appears once. A repeated one arrives as an array, and counts as absent. */
export function singleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** `?page=`: an integer from 1 to MAX_PAGE, written plainly (no "01", "1.0" or "1e2"); else 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = singleParam(value);
  if (!raw || !/^[1-9][0-9]{0,3}$/.test(raw)) return 1;
  const page = Number(raw);
  return page <= MAX_PAGE ? page : 1;
}

/** `?sort=`: one of APP_SORTS; anything else is the default, popular. */
export function parseSort(value: string | string[] | undefined): AppSort {
  const raw = singleParam(value);
  return APP_SORTS.find((sort) => sort === raw) ?? "popular";
}

/** `path` with `?sort=&page=`, leaving out defaults: `/`, not `/?page=1&sort=popular`. */
export function browseHref(path: string, { sort, page }: { sort: AppSort; page: number }): string {
  const query = new URLSearchParams();
  if (sort !== "popular") query.set("sort", sort);
  if (page !== 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

/** `GET /api/apps` with already-normalized params. */
export function fetchApps(options: {
  sort: AppSort;
  page?: number;
  pageSize?: number;
  category?: Category;
}): Promise<AppPage> {
  const { sort, page = 1, pageSize = BROWSE_PAGE_SIZE, category } = options;
  const query = new URLSearchParams({ sort, page: String(page), pageSize: String(pageSize) });
  if (category) query.set("category", category);
  return serverFetch<AppPage>(`/api/apps?${query}`);
}
