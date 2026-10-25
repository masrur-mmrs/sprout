import Link from "next/link";
import { CATEGORIES } from "@/lib/api/types";
import { categoryHref } from "@/lib/categories";

/** Every category as a wrapping row of pills, in display order. */
export function CategoryLinks() {
  return (
    <ul className="flex flex-wrap gap-2">
      {CATEGORIES.map((category) => (
        <li key={category}>
          <Link
            href={categoryHref(category)}
            className="focus-ring inline-flex h-9 items-center rounded-full border border-slate-300 bg-surface px-3.5 text-sm font-medium text-ink transition-colors duration-(--duration-fast) hover:bg-slate-100"
          >
            {category}
          </Link>
        </li>
      ))}
    </ul>
  );
}
