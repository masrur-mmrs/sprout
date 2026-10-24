import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../src/db/pool.js";
import { FUZZY_SEARCH_SQL } from "../src/modules/apps/apps.queries.js";

// Not useTestDb(): the fixture is built once, and its per-test TRUNCATE would wipe it.
const TRUNCATE = "TRUNCATE users, password_resets, apps, reviews RESTART IDENTITY CASCADE";
const PERF_APPS = 10_000;

/**
 * Varied apps: two-word titles and ~25-word descriptions of md5-derived pseudo-words, so rows
 * share few trigrams, as in a real catalog. The searched words are rare, as real ones are: one
 * title in 250 is "Spotlify N", and one description in 250 says "pomodoro" (never in a title).
 */
const PERF_FIXTURE = `
  INSERT INTO apps (developer_id, title, tagline, description, category, version, file_url)
  SELECT $1,
         CASE WHEN g % 250 = 0 THEN 'Spotlify ' || g
              ELSE initcap(translate(substr(md5(g || 't1'), 1, 4 + g % 5), '0123456789', 'ghijklmnop'))
                   || ' ' ||
                   initcap(translate(substr(md5(g || 't2'), 1, 5 + g % 4), '0123456789', 'ghijklmnop'))
         END,
         'Perf fixture app ' || g,
         concat_ws(' ',
           'Keeps your',
           regexp_replace(translate(md5(g || 'd1') || md5(g || 'd2'), '0123456789', 'ghijklmnop'),
                          '(.{6})', '\\1 ', 'g'),
           CASE WHEN g % 250 = 125 THEN 'pomodoro' END,
           'in one place, with',
           regexp_replace(translate(md5(g || 'd3') || md5(g || 'd4'), '0123456789', 'ghijklmnop'),
                          '(.{7})', '\\1 ', 'g'),
           'out of the box.'),
         'Other',
         '1.0.' || g,
         'gs://perf-fixture/' || g
  FROM generate_series(1, $2) AS g`;

interface PlanNode {
  "Node Type": string;
  "Index Name"?: string;
  Plans?: PlanNode[];
}

function indexNames(node: PlanNode): string[] {
  return [
    ...(node["Index Name"] ? [node["Index Name"]] : []),
    ...(node.Plans ?? []).flatMap(indexNames),
  ];
}

beforeAll(async () => {
  await pool.query(TRUNCATE);
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ('perf_dev', 'perf@sprout.test', 'not-a-real-hash', 'developer') RETURNING id`,
  );
  await pool.query(PERF_FIXTURE, [rows[0]?.id, PERF_APPS]);
  // VACUUM, not just ANALYZE: a bulk insert leaves its index entries in each GIN index's pending
  // list (~360 pages each here), which every index search must scan, so the planner rightly picks
  // a sequential scan until the list is flushed. Autovacuum flushes it within seconds; this does
  // the same now. The planner's settings are left alone.
  await pool.query("VACUUM ANALYZE apps");
}, 60_000);

afterAll(async () => {
  await pool.query(TRUNCATE);
  await pool.end();
});

describe("the fuzzy search query plan", () => {
  it.each([
    ["a title typo", "spotfy"],
    ["two words with typos", "phto editr"],
    ["a description-only word", "pomodoro"],
  ])("uses the trigram indexes for %s once apps holds thousands of rows", async (_case, q) => {
    const { rows } = await pool.query<{ "QUERY PLAN": [{ Plan: PlanNode }] }>(
      `EXPLAIN (FORMAT JSON) ${FUZZY_SEARCH_SQL}`,
      [q],
    );
    const plan = rows[0]?.["QUERY PLAN"][0].Plan;
    if (!plan) throw new Error("EXPLAIN returned no plan");

    // The WHERE is an OR, so the planner either serves both sides from their indexes
    // (a BitmapOr) or neither (a sequential scan of apps).
    expect(indexNames(plan)).toEqual(
      expect.arrayContaining(["apps_title_trgm_idx", "apps_desc_trgm_idx"]),
    );
  });
});
