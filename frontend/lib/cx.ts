/** Joins class names, skipping falsy ones. Later classes don't override earlier ones: no merging. */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
