import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { buttonStyles } from "./ui/Button";
import { TextLink } from "./ui/TextLink";

// The same box as a small secondary button, so a step that doesn't apply holds its place. Dimmed
// like a disabled button (inactive controls are exempt from the 4.5:1 text minimum).
const UNAVAILABLE = "inline-flex h-9 items-center px-3.5 text-sm font-semibold text-slate-400";

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** The URL of another page of the same list, with the rest of its query kept. */
  hrefFor: (page: number) => string;
}

/**
 * Previous and Next around "Page X of Y". A step that doesn't apply (Previous on page 1) is plain
 * text, not a link. Nothing renders for a single page.
 */
export function Pagination({ page, totalPages, hrefFor }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={buttonStyles("secondary", "sm")}>
          Previous
        </Link>
      ) : (
        <span className={UNAVAILABLE}>Previous</span>
      )}
      <p aria-current="page" className="text-sm text-muted">
        Page {page} of {totalPages}
      </p>
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={buttonStyles("secondary", "sm")}>
          Next
        </Link>
      ) : (
        <span className={UNAVAILABLE}>Next</span>
      )}
    </nav>
  );
}

/** A quiet message in place of a list: nothing to show, and optionally the way back. */
export function ListNotice({
  title,
  children,
  className,
}: {
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-card border border-dashed border-slate-300 px-5 py-10 text-center",
        className,
      )}
    >
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

/** A page past the end of a list that isn't empty, e.g. `?page=500`. */
export function PastTheEnd({ firstPageHref }: { firstPageHref: string }) {
  return (
    <ListNotice title="Nothing on this page">
      <TextLink href={firstPageHref}>Go to the first page</TextLink>
    </ListNotice>
  );
}
