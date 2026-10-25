import Link from "next/link";
import type { AppPage, AppSort } from "@/lib/api/types";
import { browseHref } from "@/lib/browse";
import { cx } from "@/lib/cx";
import { AppGrid } from "./AppCard";
import { ListNotice, Pagination, PastTheEnd } from "./Pagination";

const SORTS: { sort: AppSort; label: string }[] = [
  { sort: "popular", label: "Popular" },
  { sort: "new", label: "New" },
  { sort: "top-rated", label: "Top rated" },
];

export interface BrowseListProps {
  title: string;
  /** h1 when the list is the page (a category, home past page 1); h2 under the home page's h1. */
  headingLevel: "h1" | "h2";
  /** The page's path; sort and page links keep it. */
  path: string;
  sort: AppSort;
  data: AppPage;
}

/**
 * The browse list shared by home and the category pages: sort links, a grid of cards and
 * pagination. Sort links are plain links marked with aria-current, and keep the scroll position,
 * so the grid re-sorts in place; a new sort starts again at page 1.
 */
export function BrowseList({ title, headingLevel: Heading, path, sort, data }: BrowseListProps) {
  // One list per page.
  const headingId = "browse-heading";
  const totalPages = Math.ceil(data.total / data.pageSize);

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Heading
          id={headingId}
          className={cx("font-semibold", Heading === "h1" ? "text-3xl" : "text-2xl")}
        >
          {title}
        </Heading>
        <nav aria-label="Sort apps">
          {/* slate-600 is 7.2:1 on slate-100; the current sort sits on a raised surface. */}
          <ul className="flex rounded-control bg-slate-100 p-1">
            {SORTS.map((option) => (
              <li key={option.sort}>
                <Link
                  href={browseHref(path, { sort: option.sort, page: 1 })}
                  scroll={false}
                  aria-current={option.sort === sort ? "page" : undefined}
                  className={cx(
                    "focus-ring flex h-8 items-center rounded-[calc(var(--radius-control)-0.25rem)] px-3 text-sm font-medium whitespace-nowrap",
                    // Presses like a Button. Hover changes the text color, so it transitions too.
                    "transition-[color,background-color,scale] duration-(--duration-press) ease-out",
                    "motion-safe:active:scale-97",
                    option.sort === sort
                      ? "bg-surface text-ink shadow-card"
                      : "text-slate-600 hover:text-ink",
                  )}
                >
                  {option.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mt-6">
        {data.total === 0 ? (
          <ListNotice title="No apps here yet">
            Check back soon, or browse another category.
          </ListNotice>
        ) : data.items.length === 0 ? (
          <PastTheEnd firstPageHref={browseHref(path, { sort, page: 1 })} />
        ) : (
          <>
            <AppGrid apps={data.items} />
            <Pagination
              page={data.page}
              totalPages={totalPages}
              hrefFor={(page) => browseHref(path, { sort, page })}
            />
          </>
        )}
      </div>
    </section>
  );
}
