// A placeholder origin that can never be a real site: `next` only counts if it stays on it.
const BASE = "http://sprout.invalid";

/**
 * The `next` redirect target, or null for "go home". Shared by the auth pages (server) and forms
 * (client), and the only way a `next` value may reach `redirect()` or `router.push`: an
 * unvalidated one could be another site, or a `javascript:` URL that runs on push.
 *
 * Only a same-origin path survives: one leading slash (`//host` is protocol-relative), no
 * backslash (browsers read `/\host` as `//host`), and no control characters (the URL parser drops
 * tabs and newlines, so `/\t/host` would become `//host`). Normalizing can still produce `//`
 * (`/.//host`), so the parsed path is checked again. Returns the normalized path, query and hash.
 *
 * Pages only: never the API (a GET there can act, e.g. count a download, and the rewrite matches
 * `/API` too) or Next's internals.
 */
export function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw[0] !== "/" || raw[1] === "/") return null;
  if (/[\\\p{Cc}]/u.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE || url.pathname.startsWith("//")) return null;
  if (/^\/(api|_next)(\/|$)/i.test(url.pathname)) return null;
  return url.pathname + url.search + url.hash;
}

/** `path` with `?next=…` when there is a validated target to carry along. */
export function withNext(path: string, next: string | null): string {
  return next ? `${path}?${new URLSearchParams({ next })}` : path;
}
