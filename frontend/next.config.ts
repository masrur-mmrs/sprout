import type { NextConfig } from "next";

// Cache Components (the create-next-app 16.4 default) is deliberately off: the plan's
// session model reads `cookies()` in server components without <Suspense> per read.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  // G1: the browser only talks to this origin, so the session cookie stays first-party. Read here,
  // not at module scope, so lint never needs it. `next build` bakes the destination into the build.
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL?.replace(/\/+$/, "");
    if (!backendUrl) {
      // `next typegen` (npm run typecheck) calls this too, but it only reads `source`.
      if (process.argv.includes("typegen")) {
        return [{ source: "/api/:path*", destination: "http://backend.invalid/api/:path*" }];
      }
      throw new Error(
        "BACKEND_URL is not set. The /api/* rewrite needs the backend origin, e.g. " +
          "BACKEND_URL=http://localhost:8080 (see frontend/.env.example).",
      );
    }
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
