import { CATEGORIES, type Category } from "./api/types";

/**
 * A category's URL slug: lower case, `&` dropped, and each run of anything else that isn't a letter
 * or digit turned into one "-". `Music & Audio` is `music-audio`, `Developer Tools` is
 * `developer-tools`.
 */
export function categorySlug(category: Category): string {
  return category
    .toLowerCase()
    .replaceAll("&", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const BY_SLUG = new Map<string, Category>(CATEGORIES.map((name) => [categorySlug(name), name]));

/**
 * The category a slug names, or null. Exact: only the canonical slug matches, so `Games`,
 * `MUSIC-AUDIO` and `music-audio-` are null rather than a second URL for the same page.
 */
export function categoryFromSlug(slug: string): Category | null {
  return BY_SLUG.get(slug) ?? null;
}

export function categoryHref(category: Category): string {
  return `/category/${categorySlug(category)}`;
}
