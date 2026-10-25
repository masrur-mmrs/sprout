// A fixed locale and time zone, so the server's render and the browser's agree on every string.
const COMPACT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const GROUPED = new Intl.NumberFormat("en-US");
const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** 18,420 → "18.4K", for cards. */
export function formatCompact(n: number): string {
  return COMPACT.format(n);
}

/** 18420 → "18,420", for the detail page. */
export function formatCount(n: number): string {
  return GROUPED.format(n);
}

/** An ISO 8601 timestamp → "Oct 25, 2026". Put it in a `<time dateTime>`. */
export function formatDay(iso: string): string {
  return DAY.format(new Date(iso));
}
