import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/store/art";
import { CATEGORY_BLURBS } from "@/components/store/copy";
import { StoreList } from "@/components/store/StoreList";
import { OtherCategories, publishHrefFor, StoreShell } from "@/components/store/StoreShell";
import { CATEGORIES } from "@/lib/api/types";
import { fetchApps, parsePage, parseSort } from "@/lib/browse";
import { categoryFromSlug, categoryHref } from "@/lib/categories";
import { getCurrentUser } from "@/lib/session";

export async function generateMetadata({
  params,
}: PageProps<"/category/[slug]">): Promise<Metadata> {
  const category = categoryFromSlug((await params).slug);
  if (!category) notFound();
  return { title: category };
}

/** One category's apps. Only a canonical slug matches; anything else is the 404 page. */
export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/category/[slug]">) {
  const category = categoryFromSlug((await params).slug);
  if (!category) notFound();
  const query = await searchParams;
  const sort = parseSort(query.sort);
  const [list, user] = await Promise.all([
    fetchApps({ category, sort, page: parsePage(query.page) }),
    getCurrentUser(),
  ]);

  return (
    <StoreShell active={category} publishHref={publishHrefFor(user)}>
      <StoreList
        title={category}
        kind="Category"
        description={CATEGORY_BLURBS[category]}
        glyph={<CategoryIcon category={category} />}
        wash={CATEGORIES.indexOf(category)}
        path={categoryHref(category)}
        sort={sort}
        data={list}
        sortable
        showCategory={false}
      />
      <OtherCategories current={category} />
    </StoreShell>
  );
}
