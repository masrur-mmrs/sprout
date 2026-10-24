import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { ApiError, serverFetch } from "./api/server";
import { SESSION_COOKIE, type User } from "./api/types";

/**
 * The signed-in viewer, or null. Memoized per request, so a render makes at most one `/me` call.
 * No cookie means no call at all. A 401 (signed out, or a bad or expired cookie) is null; any
 * other failure throws, so a backend outage isn't mistaken for "signed out".
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  if (!(await cookies()).get(SESSION_COOKIE)?.value) return null;
  try {
    return await serverFetch<User>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
});
