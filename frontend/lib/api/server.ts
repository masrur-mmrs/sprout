import "server-only";
import { cookies } from "next/headers";
import { apiRequest, type ApiPath } from "./http";
import { SESSION_COOKIE } from "./types";

export { ApiError } from "./http";

function backendUrl(): string {
  const url = process.env.BACKEND_URL?.replace(/\/+$/, "");
  if (!url) throw new Error("BACKEND_URL is not set (see frontend/.env.example).");
  return url;
}

/**
 * A server component's GET, sent straight to the backend. It forwards only the session cookie,
 * never the browser's whole Cookie header, and sends no Origin, so the backend's CSRF check lets
 * it through. `no-store`: the response can depend on who is asking. No JSON endpoint redirects, so
 * a redirect is refused rather than followed (e.g. into /download's 302). Failures throw ApiError.
 */
export async function serverFetch<T>(path: ApiPath): Promise<T> {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  const headers: Record<string, string> = { Accept: "application/json" };
  // Next hands the value over URI-decoded; re-encode it so a forged one can't add a cookie or break the header.
  if (session) headers.Cookie = `${SESSION_COOKIE}=${encodeURIComponent(session)}`;
  return apiRequest<T>(`${backendUrl()}${path}`, { headers, cache: "no-store", redirect: "error" });
}
