/**
 * The fixed category list (Cross-Phase Contracts), in display order. `apps.category` must be one of
 * these, and Phase 6's `GET /api/categories` returns it as is.
 */
export const CATEGORIES = [
  "Productivity",
  "Developer Tools",
  "Games",
  "Design",
  "Utilities",
  "Education",
  "Music & Audio",
  "Photo & Video",
  "Social",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];
