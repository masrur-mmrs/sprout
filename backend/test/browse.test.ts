import request, { type Response } from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/pool.js";
import { seed } from "../src/db/seed.js";
import { listApps } from "../src/modules/apps/apps.queries.js";
import type { AppSort } from "../src/modules/apps/apps.schemas.js";
import { CATEGORIES } from "../src/modules/apps/categories.js";
import { rowCounts } from "./helpers/db.js";
import { fakeEmailSender } from "./helpers/email.js";
import { fakeStorage } from "./helpers/storage.js";

// Every test here only reads, so the seed goes in once: seed() hashes five passwords at bcrypt
// cost 12 and refuses a non-empty users table. Not useTestDb(): its per-test TRUNCATE would wipe it.
const TRUNCATE = "TRUNCATE users, password_resets, apps, reviews RESTART IDENTITY CASCADE";
beforeAll(async () => {
  await pool.query(TRUNCATE);
  await seed();
});
afterAll(async () => {
  await pool.query(TRUNCATE);
  await pool.end();
});

const app = createApp({ db: pool, email: fakeEmailSender(), storage: fakeStorage() });

// The seed's 15 apps in each sort's order (src/db/seed.ts).
const POPULAR = [
  "Spotlify",
  "Disk Sweep",
  "Pixel Quest",
  "Photo Editor",
  "Clipboard Keeper",
  "JSON Lens",
  "Clip Cutter",
  "Focus Timer",
  "Flashcard Forge",
  "Swatchbook",
  "Git Glance",
  "Habit Garden",
  "Star Atlas",
  "Campfire Chat",
  "Recipe Box",
];
const NEWEST = [
  "Recipe Box",
  "Campfire Chat",
  "Git Glance",
  "Pixel Quest",
  "Habit Garden",
  "Flashcard Forge",
  "Clip Cutter",
  "JSON Lens",
  "Photo Editor",
  "Clipboard Keeper",
  "Swatchbook",
  "Spotlify",
  "Star Atlas",
  "Focus Timer",
  "Disk Sweep",
];
// Average DESC (unrated last), then review count DESC, then id DESC (seed insertion order).
const TOP_RATED = [
  "Clipboard Keeper", // 5 from 1 review, id 12
  "Habit Garden", // 5 from 1 review, id 4
  "JSON Lens", // 4.67
  "Star Atlas", // 4.5 from 2 reviews: ids 14, 7, 6, 5, 3, 2
  "Clip Cutter",
  "Swatchbook",
  "Pixel Quest",
  "Focus Timer",
  "Photo Editor",
  "Git Glance", // 4 from 2 reviews
  "Campfire Chat", // 4 from 1 review
  "Spotlify", // 3.67
  "Flashcard Forge", // 3.5: ids 13, 11
  "Disk Sweep",
  "Recipe Box", // no reviews
];

const SUMMARY_KEYS = [
  "avg_rating",
  "category",
  "download_count",
  "icon_url",
  "id",
  "review_count",
  "tagline",
  "title",
];
const PUBLIC_APP_KEYS = [
  "category",
  "created_at",
  "description",
  "developer_id",
  "download_count",
  "icon_url",
  "id",
  "tagline",
  "title",
  "updated_at",
  "version",
];

interface Summary {
  id: number;
  title: string;
  avg_rating: number | null;
  review_count: number;
  match_score?: number;
}

/**
 * Every request in this file goes through here: no file_url, gs:// URL or account data leaves
 * (INV-4), and the response has the route's caching.
 */
async function get(
  path: string,
  query?: Record<string, string>,
  cacheControl = "no-store",
): Promise<Response> {
  const res = await (query ? request(app).get(path).query(query) : request(app).get(path));
  for (const leak of ["file_url", "gs://", "@sprout.test", "password_hash", "$2b$"]) {
    expect(res.text ?? "").not.toContain(leak);
  }
  expect(JSON.stringify(res.headers)).not.toContain("gs://");
  expect(res.headers["cache-control"]).toBe(cacheControl);
  return res;
}

const titles = (items: Summary[]) => items.map((item) => item.title);

async function appId(title: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>("SELECT id FROM apps WHERE title = $1", [
    title,
  ]);
  if (!rows[0]) throw new Error(`No seeded app "${title}"`);
  return rows[0].id;
}

function expectValidationError(res: Response, field: string): void {
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("VALIDATION_ERROR");
  expect(res.body.error.details).toHaveProperty(field);
}

describe("GET /api/apps", () => {
  it("lists the most downloaded apps first by default, as AppSummary items", async () => {
    const res = await get("/api/apps");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 24, total: 15 });
    expect(Object.keys(res.body).sort()).toEqual(["items", "page", "pageSize", "total"]);
    expect(titles(res.body.items)).toEqual(POPULAR);
    for (const item of res.body.items) expect(Object.keys(item).sort()).toEqual(SUMMARY_KEYS);
    expect((await get("/api/apps", { sort: "popular" })).body.items).toEqual(res.body.items);
  });

  it("lists the newest apps first with sort=new", async () => {
    const res = await get("/api/apps", { sort: "new" });

    expect(res.status).toBe(200);
    expect(titles(res.body.items)).toEqual(NEWEST);
  });

  it("lists the best-rated apps first with sort=top-rated, and unrated apps last", async () => {
    const res = await get("/api/apps", { sort: "top-rated" });

    expect(res.status).toBe(200);
    expect(titles(res.body.items)).toEqual(TOP_RATED);
    expect(res.body.items[0]).toMatchObject({ avg_rating: 5, review_count: 1 });
    expect(res.body.items.at(-1)).toMatchObject({
      title: "Recipe Box",
      avg_rating: null,
      review_count: 0,
    });
  });

  it("returns the review aggregate as numbers, not strings", async () => {
    const { items }: { items: Summary[] } = (await get("/api/apps")).body;

    for (const item of items) {
      expect(typeof item.review_count).toBe("number");
      if (item.review_count > 0) expect(typeof item.avg_rating).toBe("number");
    }
    const spotlify = items.find((item) => item.title === "Spotlify");
    expect(spotlify?.avg_rating).toBeCloseTo(11 / 3);
    expect(spotlify?.review_count).toBe(3);
  });

  it("filters by category, URL-encoded", async () => {
    const productivity = await get("/api/apps", { category: "Productivity" });
    expect(productivity.status).toBe(200);
    expect(titles(productivity.body.items)).toEqual(["Focus Timer", "Habit Garden"]);
    expect(productivity.body.total).toBe(2);

    // "&" in the value: an unencoded one would split it into two parameters.
    const music = await get("/api/apps?category=Music%20%26%20Audio&sort=top-rated");
    expect(music.status).toBe(200);
    expect(titles(music.body.items)).toEqual(["Spotlify"]);
    expect(music.body.total).toBe(1);
  });

  it("pages without overlap, each page carrying the full total", async () => {
    const pages = await Promise.all(
      ["1", "2", "3"].map((page) => get("/api/apps", { page, pageSize: "5" })),
    );

    pages.forEach((res, i) => {
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: i + 1, pageSize: 5, total: 15 });
      expect(titles(res.body.items)).toEqual(POPULAR.slice(i * 5, i * 5 + 5));
    });
  });

  it("returns an empty page past the end, with the real total", async () => {
    for (const page of ["4", "1000"]) {
      const res = await get("/api/apps", { page, pageSize: "5" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], page: Number(page), pageSize: 5, total: 15 });
    }
  });

  it("accepts the largest page and page size", async () => {
    const res = await get("/api/apps", { page: "1", pageSize: "48" });

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(15);
  });

  it.each([
    ["sort", "sort=best"],
    ["sort", "sort="],
    ["sort", "sort=new&sort=popular"],
    ["sort", "sort=popular%3B%20DROP%20TABLE%20apps"],
    ["sort", "sort=constructor"],
    ["category", "category=Gamez"],
    ["category", "category="],
    ["category", "category=games"],
    ["category", "category=Games&category=Design"],
    ["category", "category=Games'%20OR%20'1'%3D'1"],
    ["pageSize", "pageSize=0"],
    ["pageSize", "pageSize=49"],
    ["pageSize", "pageSize="],
    ["page", "page=0"],
    ["page", "page=1001"],
    ["page", "page=1.5"],
    ["page", "page=abc"],
    ["page", "page=1%3BDROP%20TABLE%20apps"],
  ])("rejects a bad %s: ?%s", async (field, queryString) => {
    expectValidationError(await get(`/api/apps?${queryString}`), field);
  });

  it("never puts a sort outside the whitelist into SQL, even when called without the schema", async () => {
    for (const sort of ["constructor", "toString", "__proto__", "a.id; DROP TABLE apps"]) {
      await expect(listApps(pool, { sort: sort as AppSort, page: 1, pageSize: 1 })).rejects.toThrow(
        "Unknown app sort",
      );
    }
    expect(await rowCounts()).toMatchObject({ apps: 15 });
  });
});

describe("GET /api/apps/search", () => {
  it("finds a title despite a typo", async () => {
    const res = await get("/api/apps/search", { q: "spotfy" });

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ title: "Spotlify", review_count: 3 });
    expect(res.body[0].avg_rating).toBeCloseTo(11 / 3);
    for (const item of res.body) {
      expect(Object.keys(item).sort()).toEqual([...SUMMARY_KEYS, "match_score"].sort());
      expect(typeof item.match_score).toBe("number");
    }
  });

  it("finds a two-word title with a typo in each word", async () => {
    const res = await get("/api/apps/search", { q: "phto editr" });

    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe("Photo Editor");
  });

  it("matches a word that appears only in a description", async () => {
    const res = await get("/api/apps/search", { q: "pomodoro" });

    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe("Focus Timer");
  });

  it("trims the query", async () => {
    const res = await get("/api/apps/search", { q: "  spotfy \t" });

    expect(res.status).toBe(200);
    expect(res.body[0].title).toBe("Spotlify");
  });

  it("returns at most 12 results, by match_score descending", async () => {
    // "and" is in every seeded description.
    const { body }: { body: Required<Summary>[] } = await get("/api/apps/search", { q: "and" });

    expect(body).toHaveLength(12);
    for (const [i, item] of body.entries()) {
      expect(item.match_score).toBeGreaterThan(0);
      expect(item.match_score).toBeLessThanOrEqual(1);
      if (i > 0) expect(item.match_score).toBeLessThanOrEqual(body[i - 1]?.match_score ?? 1);
    }
  });

  it("returns [] when nothing matches", async () => {
    const res = await get("/api/apps/search", { q: "zzqxv" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("answers a query with no letter or digit without scanning every description", async () => {
    const query = vi.spyOn(pool, "query");
    try {
      for (const q of ["!!!", "...", "- - -", "🙂🙂🙂"]) {
        const res = await get("/api/apps/search", { q });

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
      }
      expect(query).not.toHaveBeenCalled();
    } finally {
      query.mockRestore();
    }
  });

  it("matches the start of a title, in any case, for a query under 3 characters", async () => {
    for (const q of ["sp", "SP", "s"]) {
      const res = await get("/api/apps/search", { q });

      expect(res.status).toBe(200);
      expect(titles(res.body)).toContain("Spotlify");
      for (const item of res.body) {
        expect(item.title.toLowerCase().startsWith(q.toLowerCase())).toBe(true);
      }
    }
    expect(titles((await get("/api/apps/search", { q: "sp" })).body)).toEqual(["Spotlify"]);

    const { body }: { body: Required<Summary>[] } = await get("/api/apps/search", { q: "p" });
    expect(titles(body).sort()).toEqual(["Photo Editor", "Pixel Quest"]);
    expect(body[0]?.match_score).toBeGreaterThanOrEqual(body[1]?.match_score ?? 1);
  });

  it("takes LIKE wildcards in a short query literally", async () => {
    for (const q of ["%", "_", "%%", "_%", "\\", "\\%"]) {
      const res = await get("/api/apps/search", { q });

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    }
  });

  it("treats SQL in the query as text", async () => {
    for (const q of ["'; DROP TABLE apps; --", "x' OR '1'='1", "a%' OR 1=1 --", "$1"]) {
      const res = await get("/api/apps/search", { q });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    }
    expect(await rowCounts()).toEqual({ users: 5, password_resets: 0, apps: 15, reviews: 27 });
  });

  it("accepts a 100-character query", async () => {
    expect((await get("/api/apps/search", { q: "a".repeat(100) })).status).toBe(200);
  });

  it.each([
    ["missing", ""],
    ["empty", "q="],
    ["whitespace-only", "q=%20%20%09"],
    ["101 characters", `q=${"a".repeat(101)}`],
    ["containing NUL", "q=spot%00ify"],
    ["repeated", "q=spotfy&q=photo"],
  ])("rejects a q that is %s", async (_case, queryString) => {
    expectValidationError(await get(`/api/apps/search?${queryString}`), "q");
  });
});

describe("GET /api/apps/:id", () => {
  it("returns an app's detail with its developer's username and review aggregate", async () => {
    const id = await appId("Spotlify");
    const { rows } = await pool.query<{ description: string; updated_at: Date }>(
      "SELECT description, updated_at FROM apps WHERE id = $1",
      [id],
    );

    const res = await get(`/api/apps/${id}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      [...PUBLIC_APP_KEYS, "avg_rating", "developer_username", "review_count"].sort(),
    );
    expect(res.body).toMatchObject({
      id,
      title: "Spotlify",
      developer_username: "nova_studio",
      review_count: 3,
      description: rows[0]?.description,
      updated_at: rows[0]?.updated_at.toISOString(),
    });
    expect(res.body.avg_rating).toBeCloseTo(11 / 3);
    expect(res.body).not.toHaveProperty("email");
  });

  it("returns a null average and zero count for an app with no reviews", async () => {
    const res = await get(`/api/apps/${await appId("Recipe Box")}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      title: "Recipe Box",
      developer_username: "orbit_labs",
      avg_rating: null,
      review_count: 0,
    });
  });

  it("returns 404 for an unknown app", async () => {
    const res = await get("/api/apps/999999");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "App not found." } });
  });

  it.each(["abc", "0", "-1", "1.5", "2147483648"])("returns 400 for the id %s", async (id) => {
    expectValidationError(await get(`/api/apps/${id}`), "id");
  });

  it("doesn't take /search for an id", async () => {
    expectValidationError(await get("/api/apps/search"), "q");
  });
});

describe("GET /api/categories", () => {
  it("returns the category list, cacheable for an hour", async () => {
    const res = await get("/api/categories", undefined, "public, max-age=3600");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([...CATEGORIES]);
    expect(res.body).toEqual([
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
    ]);
  });
});

describe("public reads", () => {
  it("never change a download count", async () => {
    const total = async () =>
      (await pool.query<{ sum: number }>("SELECT sum(download_count)::int AS sum FROM apps"))
        .rows[0]?.sum;
    const before = await total();

    await get("/api/apps");
    await get("/api/apps/search", { q: "spotfy" });
    await get(`/api/apps/${await appId("Spotlify")}`);

    expect(await total()).toBe(before);
  });
});
