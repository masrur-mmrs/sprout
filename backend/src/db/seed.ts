import { existsSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import bcrypt from "bcrypt";
import type { PoolClient } from "pg";
import { env } from "../config/env.js";
import { pool, withTransaction } from "./pool.js";

/** Every seed account signs in with this password. Dev data only: seed() refuses production. */
export const SEED_PASSWORD = "sprout-dev-password";

// The plan's fixed category list (Cross-Phase Contracts). Phase 5 adds the shared backend constant.
type Category =
  | "Productivity"
  | "Developer Tools"
  | "Games"
  | "Design"
  | "Utilities"
  | "Education"
  | "Music & Audio"
  | "Photo & Video"
  | "Social"
  | "Other";

interface SeedUser {
  username: string;
  email: string;
  role: "developer" | "user";
}

interface SeedApp {
  developer: string;
  title: string;
  tagline: string;
  description: string;
  category: Category;
  version: string;
  file: string;
  downloads: number;
  daysAgo: number;
}

const USERS: SeedUser[] = [
  { username: "nova_studio", email: "nova@sprout.test", role: "developer" },
  { username: "orbit_labs", email: "orbit@sprout.test", role: "developer" },
  { username: "alex", email: "alex@sprout.test", role: "user" },
  { username: "sam_k", email: "sam@sprout.test", role: "user" },
  { username: "riya", email: "riya@sprout.test", role: "user" },
];

// Search fixtures for Phase 6: q=spotfy finds Spotlify, q=phto editr finds Photo Editor, and
// "pomodoro" appears only in Focus Timer's description.
const APPS: SeedApp[] = [
  {
    developer: "nova_studio",
    title: "Spotlify",
    tagline: "Your music library, streamed to every device",
    description:
      "Indexes the music folders on your computer and streams them to your phone, tablet or a second laptop on the same network. Build playlists and pick up a track where you left off.",
    category: "Music & Audio",
    version: "2.3.1",
    file: "spotlify-2.3.1.dmg",
    downloads: 18420,
    daysAgo: 210,
  },
  {
    developer: "nova_studio",
    title: "Photo Editor",
    tagline: "Fast, non-destructive edits for RAW and JPEG",
    description:
      "Crop, straighten and grade photos with curves, HSL and masking tools. Every adjustment is non-destructive, so the original file is never touched. Exports to JPEG, PNG, WebP and TIFF.",
    category: "Photo & Video",
    version: "4.0.2",
    file: "photo-editor-4.0.2.exe",
    downloads: 9310,
    daysAgo: 120,
  },
  {
    developer: "nova_studio",
    title: "Focus Timer",
    tagline: "Work in short sprints, rest on schedule",
    description:
      "A distraction-free pomodoro timer: 25-minute work sessions, short breaks, and a long break every fourth round. It mutes notifications while you work and keeps a weekly log of finished sessions.",
    category: "Productivity",
    version: "1.6.0",
    file: "focus-timer-1.6.0.zip",
    downloads: 5120,
    daysAgo: 300,
  },
  {
    developer: "nova_studio",
    title: "Habit Garden",
    tagline: "Grow a plant for every streak you keep",
    description:
      "Track daily habits and watch a small garden grow as your streaks get longer. Miss a day and a plant wilts, but it recovers when you start again. Reminders, notes and a yearly heatmap included.",
    category: "Productivity",
    version: "1.2.4",
    file: "habit-garden-1.2.4.apk",
    downloads: 2780,
    daysAgo: 45,
  },
  {
    developer: "nova_studio",
    title: "Pixel Quest",
    tagline: "A tiny roguelike with hand-drawn dungeons",
    description:
      "Explore procedurally generated dungeons in a 16-color pixel art style. Every run lasts about twenty minutes, items combine in surprising ways, and dying sends you back to the village.",
    category: "Games",
    version: "0.9.3",
    file: "pixel-quest-0.9.3.zip",
    downloads: 12650,
    daysAgo: 30,
  },
  {
    developer: "nova_studio",
    title: "Swatchbook",
    tagline: "Build and share color palettes",
    description:
      "Generate harmonious color palettes from a photo or a single seed color, check contrast against WCAG AA, and export to CSS variables, a Tailwind config or Figma styles.",
    category: "Design",
    version: "3.1.0",
    file: "swatchbook-3.1.0.dmg",
    downloads: 4300,
    daysAgo: 160,
  },
  {
    developer: "nova_studio",
    title: "Clip Cutter",
    tagline: "Trim and join video clips without re-encoding",
    description:
      "Cut the boring parts out of screen recordings and phone videos in seconds. Lossless trimming keeps the original quality, and the timeline shows keyframes so cuts land cleanly.",
    category: "Photo & Video",
    version: "2.0.0",
    file: "clip-cutter-2.0.0.msi",
    downloads: 6900,
    daysAgo: 75,
  },
  {
    developer: "nova_studio",
    title: "Campfire Chat",
    tagline: "Small group chats for close friends",
    description:
      "Private group chats capped at twelve people, with voice rooms that stay open like a campfire. No public profiles, no follower counts, and messages can expire after a day or a week.",
    category: "Social",
    version: "1.0.5",
    file: "campfire-chat-1.0.5.apk",
    downloads: 1580,
    daysAgo: 12,
  },
  {
    developer: "orbit_labs",
    title: "JSON Lens",
    tagline: "Explore huge JSON files without freezing",
    description:
      "Opens multi-gigabyte JSON and NDJSON files by streaming them, with a collapsible tree, JSONPath queries and a diff view for comparing two documents.",
    category: "Developer Tools",
    version: "1.8.2",
    file: "json-lens-1.8.2.AppImage",
    downloads: 7740,
    daysAgo: 95,
  },
  {
    developer: "orbit_labs",
    title: "Git Glance",
    tagline: "A calm dashboard for every repo on your machine",
    description:
      "Lists every Git repository under your projects folder with its branch, uncommitted changes and unpushed commits, so nothing gets forgotten before you switch laptops.",
    category: "Developer Tools",
    version: "0.4.1",
    file: "git-glance-0.4.1.deb",
    downloads: 3150,
    daysAgo: 20,
  },
  {
    developer: "orbit_labs",
    title: "Disk Sweep",
    tagline: "Find what is filling up your drive",
    description:
      "Scans a drive in seconds and draws a sunburst chart of folder sizes. Finds duplicate files, old installers and forgotten caches, and moves them to the trash in one click.",
    category: "Utilities",
    version: "5.2.0",
    file: "disk-sweep-5.2.0.pkg",
    downloads: 15200,
    daysAgo: 400,
  },
  {
    developer: "orbit_labs",
    title: "Clipboard Keeper",
    tagline: "Never lose something you copied",
    description:
      "Keeps a searchable history of everything you copy, including images and files. Pin snippets you reuse; entries copied from password managers are skipped automatically.",
    category: "Utilities",
    version: "2.2.0",
    file: "clipboard-keeper-2.2.0.exe",
    downloads: 8830,
    daysAgo: 140,
  },
  {
    developer: "orbit_labs",
    title: "Flashcard Forge",
    tagline: "Spaced-repetition flashcards that write themselves",
    description:
      "Paste lecture notes and get a deck of question-and-answer cards, then review them on a schedule that shows hard cards more often. Works offline and syncs decks as plain Markdown.",
    category: "Education",
    version: "1.3.0",
    file: "flashcard-forge-1.3.0.zip",
    downloads: 4410,
    daysAgo: 60,
  },
  {
    developer: "orbit_labs",
    title: "Star Atlas",
    tagline: "An offline sky map for stargazing",
    description:
      "Point your phone at the sky to identify stars, planets and constellations. Includes a night mode that keeps your eyes dark-adapted and a calendar of meteor showers.",
    category: "Education",
    version: "3.0.1",
    file: "star-atlas-3.0.1.apk",
    downloads: 2240,
    daysAgo: 250,
  },
  {
    developer: "orbit_labs",
    title: "Recipe Box",
    tagline: "Save recipes from any site, minus the life story",
    description:
      "Paste a recipe link and keep just the ingredients and steps. Scale servings, convert units, and build a shopping list for the week.",
    category: "Other",
    version: "1.1.0",
    file: "recipe-box-1.1.0.dmg",
    downloads: 990,
    daysAgo: 5,
  },
];

// Nobody reviews their own app (Phase 7 forbids it), and Recipe Box is left with no reviews.
const REVIEWS: [app: string, reviewer: string, rating: number, comment: string | null][] = [
  ["Spotlify", "alex", 5, "Replaced three apps for me."],
  ["Photo Editor", "alex", 4, "Masking is great; exports are a bit slow."],
  ["Focus Timer", "alex", 5, null],
  ["Pixel Quest", "alex", 4, "One more run, every night."],
  ["JSON Lens", "alex", 5, "Opened a 2 GB log without breaking a sweat."],
  ["Disk Sweep", "alex", 3, "Does the job, but the chart is hard to read."],
  ["Spotlify", "sam_k", 4, "Great, but playlists need folders."],
  ["Habit Garden", "sam_k", 5, "The wilting plant guilt works."],
  ["Swatchbook", "sam_k", 5, "The contrast checker saves me daily."],
  ["Clip Cutter", "sam_k", 4, null],
  ["Git Glance", "sam_k", 4, "Caught two branches I forgot to push."],
  ["Clipboard Keeper", "sam_k", 5, "Can't use a computer without it now."],
  ["Flashcard Forge", "sam_k", 3, "Generated cards need some cleanup."],
  ["Star Atlas", "sam_k", 5, "Found Saturn on the first try."],
  ["Photo Editor", "riya", 5, "Best curves tool I have used."],
  ["Focus Timer", "riya", 4, "Simple, and it stays out of the way."],
  ["Pixel Quest", "riya", 5, null],
  ["Campfire Chat", "riya", 4, "Exactly the size of my friend group."],
  ["JSON Lens", "riya", 4, "The diff view is underrated."],
  ["Disk Sweep", "riya", 4, null],
  ["Flashcard Forge", "riya", 4, "Got me through exams."],
  ["Star Atlas", "riya", 4, "Night mode is a nice touch."],
  ["JSON Lens", "nova_studio", 5, "We use it on every project."],
  ["Git Glance", "nova_studio", 4, null],
  ["Swatchbook", "orbit_labs", 4, "Clean exports."],
  ["Clip Cutter", "orbit_labs", 5, "Lossless trimming is the killer feature."],
  ["Spotlify", "orbit_labs", 2, "Kept losing my library on restart."],
];

export interface SeedSummary {
  users: number;
  apps: number;
  reviews: number;
}

/** Inserts the dev fixture in one transaction. Runs only on an empty database, never in production. */
export async function seed(): Promise<SeedSummary> {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed: NODE_ENV is production. The seed is dev and test data only.",
    );
  }

  // Hash before BEGIN so the transaction isn't held open across the bcrypt rounds.
  const hashes = await Promise.all(USERS.map(() => bcrypt.hash(SEED_PASSWORD, 12)));

  return withTransaction(async (client) => {
    const { rows } = await client.query<{ taken: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM users) AS taken",
    );
    if (rows[0]?.taken) {
      throw new Error("Refusing to seed: the users table is not empty. Seed a fresh database.");
    }

    const userIds = new Map<string, number>();
    for (const [i, user] of USERS.entries()) {
      const id = await insertReturningId(
        client,
        "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
        [user.username, user.email.trim().toLowerCase(), hashes[i], user.role],
      );
      userIds.set(user.username, id);
    }

    const appIds = new Map<string, number>();
    for (const app of APPS) {
      const id = await insertReturningId(
        client,
        `INSERT INTO apps (developer_id, title, tagline, description, category, version, file_url,
                           download_count, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 NOW() - make_interval(days => $9), NOW() - make_interval(days => $9))
         RETURNING id`,
        [
          lookup(userIds, app.developer),
          app.title,
          app.tagline,
          app.description,
          app.category,
          app.version,
          `gs://${env.GCS_BINARY_BUCKET}/seed/${app.file}`, // placeholder: no object exists
          app.downloads,
          app.daysAgo,
        ],
      );
      appIds.set(app.title, id);
    }

    for (const [app, reviewer, rating, comment] of REVIEWS) {
      await client.query(
        "INSERT INTO reviews (app_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)",
        [lookup(appIds, app), lookup(userIds, reviewer), rating, comment],
      );
    }

    return { users: USERS.length, apps: APPS.length, reviews: REVIEWS.length };
  });
}

async function insertReturningId(
  client: PoolClient,
  text: string,
  params: unknown[],
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(text, params);
  if (!rows[0]) throw new Error(`Expected one row back from: ${text}`);
  return rows[0].id;
}

function lookup(ids: Map<string, number>, key: string): number {
  const id = ids.get(key);
  if (id === undefined) throw new Error(`Seed data references unknown "${key}"`);
  return id;
}

async function main(): Promise<void> {
  try {
    const summary = await seed();
    console.log(
      `Seeded ${summary.users} users, ${summary.apps} apps and ${summary.reviews} reviews.`,
    );
    console.log(`Dev sign-in (every account's password is "${SEED_PASSWORD}"):`);
    for (const user of USERS) console.log(`  ${user.role.padEnd(9)}  ${user.email}`);
  } finally {
    await pool.end();
  }
}

// Run only when executed directly (npm run db:seed), not when a test imports seed(). argv[1] may
// not be a file at all (node -e), and realpathSync would throw on import.
const entry = process.argv[1];
if (entry && existsSync(entry) && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
