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

const BYTES = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const BYTE_UNITS = ["B", "KB", "MB", "GB"];

/**
 * 1024-based, so the upload limits read as round numbers: 524,288,000 → "500 MB", 1536 → "1.5 KB".
 * It moves up a unit once the rounded value would reach 1,024, so 1,048,575 bytes is "1 MB".
 */
export function formatBytes(n: number): string {
  let value = n;
  let unit = 0;
  while (unit < BYTE_UNITS.length - 1 && Math.round(value * 10) / 10 >= 1024) {
    value /= 1024;
    unit++;
  }
  return `${BYTES.format(value)} ${BYTE_UNITS[unit]}`;
}
