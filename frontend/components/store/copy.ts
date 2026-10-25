import type { AppSort, Category } from "@/lib/api/types";
import type { BrowseKey } from "./StoreShell";

/** The three browse lists, each one sort of every app. */
export const BROWSE_LISTS: Record<
  AppSort,
  { key: BrowseKey; title: string; description: string; wash: number }
> = {
  popular: {
    key: "popular",
    title: "Top charts",
    description: "The most downloaded apps on Sprout, ranked by every download so far.",
    wash: 0,
  },
  new: {
    key: "new",
    title: "New releases",
    description: "The latest apps from independent developers, newest first.",
    wash: 1,
  },
  "top-rated": {
    key: "top-rated",
    title: "Top rated",
    description: "The apps reviewers rate highest, from five stars down.",
    wash: 2,
  },
};

/** One line under each category's name. */
export const CATEGORY_BLURBS: Record<Category, string> = {
  Productivity: "Timers, notes and planners for getting things done.",
  "Developer Tools": "Utilities for writing, testing and shipping code.",
  Games: "Small, strange and wonderful games from indie studios.",
  Design: "Tools for colour, type, layout and everything visual.",
  Utilities: "Small apps that keep your computer tidy and quick.",
  Education: "Flashcards, courses and tools for learning something new.",
  "Music & Audio": "Players, recorders and instruments for your ears.",
  "Photo & Video": "Editors and organisers for your pictures and clips.",
  Social: "Ways to chat, share and stay in touch.",
  Other: "Everything that doesn't fit a box, yet.",
};
