import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import { SEED_PASSWORD, seed } from "../src/db/seed.js";
import { rowCounts, useTestDb } from "./helpers/db.js";

const pool = useTestDb();

const CATEGORIES = [
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
];

describe("seed", () => {
  it("runs cleanly on a fresh database", async () => {
    expect(await seed()).toEqual({ users: 5, apps: 15, reviews: 27 });
    expect(await rowCounts()).toEqual({ users: 5, password_resets: 0, apps: 15, reviews: 27 });
  });

  it("produces data that keeps the schema's and later phases' rules", async () => {
    await seed();

    const users = await pool.query<{ email: string; password_hash: string }>(
      "SELECT email, password_hash FROM users",
    );
    for (const { email, password_hash } of users.rows) {
      expect(email).toBe(email.trim().toLowerCase());
      expect(password_hash).toMatch(/^\$2b\$12\$/);
    }
    expect(await bcrypt.compare(SEED_PASSWORD, users.rows[0]?.password_hash ?? "")).toBe(true);

    const apps = await pool.query<{ category: string; file_url: string }>(
      "SELECT category, file_url FROM apps",
    );
    for (const { category, file_url } of apps.rows) {
      expect(CATEGORIES).toContain(category);
      expect(file_url).toMatch(/^gs:\/\/[^/]+\/seed\//);
    }
    expect(new Set(apps.rows.map((app) => app.category)).size).toBe(CATEGORIES.length);

    const selfReviews = await pool.query(
      "SELECT 1 FROM reviews r JOIN apps a ON a.id = r.app_id WHERE a.developer_id = r.user_id",
    );
    expect(selfReviews.rowCount).toBe(0);
  });

  it("gives the Phase 6 fuzzy-search cases a top match", async () => {
    await seed();

    // The plan's Phase 6 search query (blueprint §5 with the G4 description fix).
    const topMatch = async (q: string) => {
      const { rows } = await pool.query<{ title: string }>(
        `SELECT title FROM apps
         WHERE title % $1 OR $1 <% description
         ORDER BY GREATEST(similarity(title, $1), word_similarity($1, description) * 0.6) DESC,
                  download_count DESC
         LIMIT 1`,
        [q],
      );
      return rows[0]?.title;
    };
    expect(await topMatch("spotfy")).toBe("Spotlify");
    expect(await topMatch("phto editr")).toBe("Photo Editor");
    expect(await topMatch("pomodoro")).toBe("Focus Timer"); // only in its description
  });

  it("refuses a database that already has users", async () => {
    await seed();
    await expect(seed()).rejects.toThrow("the users table is not empty");
    expect(await rowCounts()).toMatchObject({ users: 5, apps: 15 });
  });

  it("refuses to run when NODE_ENV is production", async () => {
    const backendDir = fileURLToPath(new URL("..", import.meta.url));
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/db/seed.ts"], {
      cwd: backendDir,
      env: { ...process.env, NODE_ENV: "production" },
      encoding: "utf8",
      timeout: 15_000,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to seed: NODE_ENV is production");
    expect(await rowCounts()).toMatchObject({ users: 0 });
  }, 20_000);
});
