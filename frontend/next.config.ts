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
};

export default nextConfig;
