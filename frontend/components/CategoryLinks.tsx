import Link from "next/link";
import { CATEGORIES } from "@/lib/api/types";
import { categoryHref } from "@/lib/categories";
import { cx } from "@/lib/cx";

/**
 * Every category as a wrapping row of pills, in display order. A pill presses like a Button: 0.97
 * on pointer-down, which motion-reduce drops, keeping the color change.
 */
export function CategoryLinks() {
  return (
    <ul className="flex flex-wrap gap-2">
      {CATEGORIES.map((category) => (
        <li key={category}>
          <Link
            href={categoryHref(category)}
            className={cx(
              "focus-ring inline-flex h-9 items-center rounded-full border border-slate-300 bg-surface px-3.5 text-sm font-medium text-ink hover:bg-slate-100",
              "transition-[background-color,scale] duration-(--duration-press) ease-out",
              "motion-safe:active:scale-97",
            )}
          >
            {category}
          </Link>
        </li>
      ))}
    </ul>
  );
}
