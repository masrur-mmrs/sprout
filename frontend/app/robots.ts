import type { MetadataRoute } from "next";

/**
 * Keeps well-behaved crawlers out of /api/. Every GET of /api/apps/:id/download counts a download
 * (INV-3) and the app pages link to it; `rel="nofollow"` alone is only a hint.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" } };
}
