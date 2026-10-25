import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseList } from "@/components/BrowseList";
import { fetchApps, parsePage, parseSort } from "@/lib/browse";
import { categoryFromSlug, categoryHref } from "@/lib/categories";

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
  const list = await fetchApps({ category, sort, page: parsePage(query.page) });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="mb-1 text-sm font-medium text-muted">Category</p>
      <BrowseList
        title={category}
        headingLevel="h1"
        path={categoryHref(category)}
        sort={sort}
        data={list}
      />
    </div>
  );
}
