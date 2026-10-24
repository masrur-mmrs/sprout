import { apiRequest, type ApiPath } from "./http";

export { ApiError } from "./http";

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * The browser's API call. Paths are relative, so requests stay on this origin and reach the backend
 * through the `/api/*` rewrite (G1). The browser attaches the httpOnly session cookie by itself.
 * Resolves with the JSON body (`undefined` for a 204); every failure throws ApiError.
 */
export function apiFetch<T>(path: ApiPath, { method = "GET", body, signal }: ApiOptions = {}) {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return apiRequest<T>(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    signal,
  });
}
