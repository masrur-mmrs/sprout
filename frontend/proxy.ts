import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/api/types";

/**
 * A UX gate only: it checks that a session cookie exists, not that it's valid. The backend is the
 * authority, and enforces ownership in SQL. Signed-out visitors go to sign-in and come back after.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const signIn = new URL("/sign-in", request.url);
  // Only the path and query, never an origin, so `next` can't point sign-in at another site.
  signIn.searchParams.set("next", pathname + search);
  return NextResponse.redirect(signIn);
}

export const config = {
  // `:path*` is zero or more segments, so bare /dashboard matches too.
  matcher: ["/dashboard/:path*"],
};
