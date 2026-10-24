import { SignJWT } from "jose";
import { DatabaseError } from "pg";
import request, { type Response } from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import type { Queryable } from "../src/db/pool.js";
import { upsertReview } from "../src/modules/reviews/reviews.queries.js";
import { MAX_COMMENT_LENGTH, REVIEWS_PAGE_SIZE } from "../src/modules/reviews/reviews.schemas.js";
import { rowCounts, useTestDb } from "./helpers/db.js";
import { fakeEmailSender } from "./helpers/email.js";
import { fakeStorage } from "./helpers/storage.js";

const db = useTestDb();
const app = createApp({ db, email: fakeEmailSender(), storage: fakeStorage() });
const secret = new TextEncoder().encode(env.JWT_SECRET);

const REVIEW_KEYS = ["comment", "created_at", "id", "rating", "username"];
const PAGE_KEYS = ["items", "mine", "page", "pageSize", "total"];
const APP_NOT_FOUND = { error: { code: "NOT_FOUND", message: "App not found." } };
const REVIEW_NOT_FOUND = { error: { code: "NOT_FOUND", message: "Review not found." } };
const BAD_IDS = ["abc", "0", "-1", "1.5", "2147483648"];
const GARBAGE_COOKIE = "sprout_session=not-a-jwt";

type Method = "get" | "put" | "delete";
interface User {
  id: number;
  username: string;
  cookie: string;
}
interface StoredReview {
  id: number;
  app_id: number;
  user_id: number;
  rating: number;
  comment: string | null;
  created_at: Date;
}

/**
 * Every response in this file goes through here: no file_url, gs:// URL or account data leaves
 * (INV-4), and the response has the route's caching. Only the global originCheck's 403, sent
 * before any router runs, is checked without a Cache-Control.
 */
function checked(res: Response, cacheControl: string | null = "no-store"): Response {
  const text = res.text ?? "";
  for (const leak of ["file_url", "gs://", "@sprout.test", "password_hash", "$2b$"]) {
    expect(text).not.toContain(leak);
  }
  expect(text).not.toMatch(/"(email|user_id)"\s*:/);
  expect(JSON.stringify(res.headers)).not.toMatch(/gs:\/\/|@sprout\.test|password_hash/);
  if (cacheControl !== null) expect(res.headers["cache-control"]).toBe(cacheControl);
  return res;
}

function sessionCookie(id: number, role: string, expiresAt: string | number = "1h") {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(id))
    .setIssuedAt(typeof expiresAt === "number" ? expiresAt - 3600 : undefined)
    .setExpirationTime(expiresAt)
    .sign(secret)
    .then((token) => `sprout_session=${token}`);
}

/** Inserts a user and signs a session cookie for them, skipping signup's bcrypt rounds. */
async function createUser(username: string, role: "developer" | "user" = "user"): Promise<User> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, 'not-a-real-hash', $3) RETURNING id`,
    [username, `${username}@sprout.test`, role],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Expected a user id");
  return { id, username, cookie: await sessionCookie(id, role) };
}

/** An app with a stored gs:// file_url, so a leak of it would show. */
async function insertApp(developer: User, title = "Test App"): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO apps (developer_id, title, tagline, description, category, version, file_url)
     VALUES ($1, $2, 'A tagline', 'A description', 'Other', '1.0.0',
             'gs://sprout-binaries-test/uploads/1/app.zip')
     RETURNING id`,
    [developer.id, title],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Expected an app id");
  return id;
}

async function call(
  method: Method,
  path: string,
  { as, cookie, body }: { as?: User; cookie?: string; body?: unknown } = {},
): Promise<Response> {
  let req = request(app)[method](path);
  const sent = as?.cookie ?? cookie;
  if (sent) req = req.set("Cookie", sent);
  return checked(await (body === undefined ? req : req.send(body as object)));
}

const reviewsPath = (appId: number | string) => `/api/apps/${appId}/reviews`;
const put = (appId: number | string, as: User | undefined, body: unknown) =>
  call("put", reviewsPath(appId), { as, body });

async function storedReviews(): Promise<StoredReview[]> {
  const { rows } = await db.query<StoredReview>(
    "SELECT id, app_id, user_id, rating, comment, created_at FROM reviews ORDER BY id",
  );
  return rows;
}

async function aggregate(appId: number): Promise<{ avg_rating: number | null; count: number }> {
  const res = await call("get", `/api/apps/${appId}`);
  expect(res.status).toBe(200);
  return { avg_rating: res.body.avg_rating, count: res.body.review_count };
}

function expectValidationError(res: Response, field: string): void {
  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("VALIDATION_ERROR");
  expect(res.body.error.details).toHaveProperty(field);
}

/** Two developers, two users and an app by `nova`. */
async function fixtures() {
  const nova = await createUser("nova", "developer");
  const orbit = await createUser("orbit", "developer");
  const riya = await createUser("riya");
  const sam = await createUser("sam");
  const appId = await insertApp(nova);
  return { nova, orbit, riya, sam, appId };
}

/**
 * Runs `statement` in an open transaction, starts `send`, waits until the request's backend is
 * blocked behind that transaction's row lock, then commits. The request's statement read the row
 * before the commit and runs its foreign-key check after it.
 */
async function racingCommit(
  statement: string,
  params: unknown[],
  send: () => Promise<Response>,
): Promise<Response> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(statement, params);
    const pending = send();
    await vi.waitFor(
      async () => {
        const { rows } = await db.query<{ blocked: number }>(
          `SELECT count(*)::int AS blocked FROM pg_stat_activity
           WHERE wait_event_type = 'Lock' AND query LIKE '%INSERT INTO reviews%'
             AND pid <> pg_backend_pid()`,
        );
        expect(rows[0]?.blocked).toBe(1);
      },
      { timeout: 5000, interval: 20 },
    );
    await client.query("COMMIT");
    return await pending;
  } finally {
    client.release();
  }
}

describe("PUT /api/apps/:id/reviews", () => {
  it("creates the caller's review and returns it as a Review with 200", async () => {
    const { riya, appId } = await fixtures();

    const res = await put(appId, riya, { rating: 4, comment: "Solid." });

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(REVIEW_KEYS);
    expect(res.body).toMatchObject({ username: "riya", rating: 4, comment: "Solid." });
    expect(new Date(res.body.created_at).toISOString()).toBe(res.body.created_at);
    expect(await storedReviews()).toMatchObject([
      { id: res.body.id, app_id: appId, user_id: riya.id, rating: 4, comment: "Solid." },
    ]);
  });

  it("updates instead of duplicating on a second PUT: one row, new values, later created_at", async () => {
    const { riya, appId } = await fixtures();
    const first = await put(appId, riya, { rating: 1, comment: "Crashes on launch." });
    await db.query("UPDATE reviews SET created_at = created_at - interval '1 hour'");
    const [before] = await storedReviews();

    const second = await put(appId, riya, { rating: 5, comment: "Fixed in 1.0.1!" });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ id: first.body.id, rating: 5, comment: "Fixed in 1.0.1!" });
    const stored = await storedReviews();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: first.body.id, rating: 5, comment: "Fixed in 1.0.1!" });
    expect(stored[0]!.created_at.getTime()).toBeGreaterThan(before!.created_at.getTime());
    expect(new Date(second.body.created_at)).toEqual(stored[0]!.created_at);
  });

  it("moves an edited review to the top of the list", async () => {
    const { riya, sam, orbit, appId } = await fixtures();
    // riya 3 hours ago, sam 2, orbit 1.
    for (const [hoursAgo, user] of [riya, sam, orbit].reverse().entries()) {
      await put(appId, user, { rating: 3 });
      await db.query(
        "UPDATE reviews SET created_at = NOW() - make_interval(hours => $1) WHERE user_id = $2",
        [hoursAgo + 1, user.id],
      );
    }
    const usernames = async () =>
      (await call("get", reviewsPath(appId))).body.items.map(
        (item: { username: string }) => item.username,
      );
    expect(await usernames()).toEqual(["orbit", "sam", "riya"]);

    await put(appId, riya, { rating: 4 });

    expect(await usernames()).toEqual(["riya", "orbit", "sam"]);
  });

  it("returns 400 with details.rating for a rating outside 1–5 or not a JSON integer", async () => {
    const { riya, appId } = await fixtures();

    for (const rating of [0, 6, -1, 4.5, "5", null, true, [5], {}, 1e10]) {
      expectValidationError(await put(appId, riya, { rating, comment: "x" }), "rating");
    }
    expectValidationError(await put(appId, riya, { comment: "no rating" }), "rating");
    expect((await rowCounts()).reviews).toBe(0);
    for (const rating of [1, 5]) expect((await put(appId, riya, { rating })).status).toBe(200);
  });

  it("returns 400 for a missing or non-object body", async () => {
    const { riya, appId } = await fixtures();

    for (const body of [[], "rating=5", undefined]) {
      const res = await put(appId, riya, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect((await rowCounts()).reviews).toBe(0);
  });

  it("trims the comment and stores a missing, null, empty or blank one as null", async () => {
    const { riya, appId } = await fixtures();

    const trimmed = await put(appId, riya, { rating: 4, comment: "  Nice app \n" });
    expect(trimmed.body.comment).toBe("Nice app");
    expect((await storedReviews())[0]?.comment).toBe("Nice app");

    for (const body of [
      { rating: 4, comment: "" },
      { rating: 4, comment: " \n\t " },
      { rating: 4, comment: null },
      { rating: 4 },
    ]) {
      const res = await put(appId, riya, body);
      expect(res.status).toBe(200);
      expect(res.body.comment).toBeNull();
      expect((await storedReviews())[0]?.comment).toBeNull();
    }
  });

  it("clears an earlier comment when a PUT leaves it out", async () => {
    const { riya, appId } = await fixtures();
    await put(appId, riya, { rating: 2, comment: "Too many ads." });

    const res = await put(appId, riya, { rating: 3 });

    expect(res.body).toMatchObject({ rating: 3, comment: null });
    expect(await storedReviews()).toMatchObject([{ rating: 3, comment: null }]);
  });

  it(`accepts a ${MAX_COMMENT_LENGTH}-character comment, rejects longer or NUL, and keeps newlines`, async () => {
    const { riya, appId } = await fixtures();
    const longest = "a".repeat(MAX_COMMENT_LENGTH);

    expect((await put(appId, riya, { rating: 5, comment: longest })).body.comment).toBe(longest);
    expect((await put(appId, riya, { rating: 5, comment: `  ${longest}\n` })).status).toBe(200);
    // zod counts UTF-16 units: 1000 emoji are 2000 units.
    const emoji = "😀".repeat(MAX_COMMENT_LENGTH / 2);
    expect((await put(appId, riya, { rating: 5, comment: emoji })).status).toBe(200);
    for (const comment of [`${longest}a`, `${emoji}a`, "bad\u0000byte", { text: "x" }, 5]) {
      expectValidationError(await put(appId, riya, { rating: 1, comment }), "comment");
    }
    expect((await storedReviews())[0]).toMatchObject({ rating: 5, comment: emoji });

    const multiline = "First line\nSecond line\r\n\n\tIndented";
    const res = await put(appId, riya, { rating: 5, comment: multiline });
    expect(res.body.comment).toBe(multiline);
    expect((await storedReviews())[0]?.comment).toBe(multiline);
  });

  it("returns 401 to anonymous callers, even with a bad body, and to invalid or expired cookies", async () => {
    const { riya, appId } = await fixtures();
    const expired = await sessionCookie(riya.id, "user", Math.floor(Date.now() / 1000) - 60);
    const forged = await new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(riya.id))
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("not-the-server-secret-but-32-chars-long"))
      .then((token) => `sprout_session=${token}`);

    const attempts = [
      await put(appId, undefined, { rating: 5 }),
      await put(appId, undefined, { rating: "five", comment: 7 }),
      await put(appId, undefined, {}),
      await call("put", reviewsPath(appId), { cookie: GARBAGE_COOKIE, body: { rating: 5 } }),
      await call("put", reviewsPath(appId), { cookie: expired, body: { rating: 5 } }),
      await call("put", reviewsPath(appId), { cookie: forged, body: { rating: 5 } }),
      // Auth comes before params, too.
      await put("abc", undefined, { rating: 5 }),
    ];

    for (const res of attempts) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
    expect((await rowCounts()).reviews).toBe(0);
  });

  it("returns 403 to the app's developer and writes nothing; another developer gets 200", async () => {
    const { nova, orbit, appId } = await fixtures();

    const own = await put(appId, nova, { rating: 5, comment: "Best app ever." });

    expect(own.status).toBe(403);
    expect(own.body).toEqual({
      error: { code: "FORBIDDEN", message: "You can't review your own app." },
    });
    expect((await rowCounts()).reviews).toBe(0);

    const other = await put(appId, orbit, { rating: 4 });
    expect(other.status).toBe(200);
    expect(await storedReviews()).toMatchObject([{ app_id: appId, user_id: orbit.id }]);
  });

  it("ignores user_id and app_id in the body: the caller reviews the app in the URL", async () => {
    const { nova, riya, sam, appId } = await fixtures();
    const otherAppId = await insertApp(nova, "Other App");

    const res = await put(appId, riya, {
      rating: 2,
      user_id: sam.id,
      app_id: otherAppId,
      id: 999,
      created_at: "2000-01-01T00:00:00Z",
    });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("riya");
    expect(res.body.id).not.toBe(999);
    expect(new Date(res.body.created_at).getFullYear()).toBeGreaterThan(2000);
    expect(await storedReviews()).toMatchObject([{ app_id: appId, user_id: riya.id, rating: 2 }]);
  });

  it("returns 404 for an unknown app and 400 for a malformed or out-of-range id", async () => {
    const { riya } = await fixtures();

    expect((await put(999, riya, { rating: 5 })).body).toEqual(APP_NOT_FOUND);
    expect((await put(999, riya, { rating: 5 })).status).toBe(404);
    for (const id of BAD_IDS) expectValidationError(await put(id, riya, { rating: 5 }), "id");
    expect((await rowCounts()).reviews).toBe(0);
  });

  it("leaves one row after concurrent PUTs from one user, all answered 200 (INV-2)", async () => {
    const { riya, appId } = await fixtures();

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((rating) => put(appId, riya, { rating, comment: `try ${rating}` })),
    );

    for (const res of results) expect(res.status).toBe(200);
    expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
    const stored = await storedReviews();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.comment).toBe(`try ${stored[0]?.rating}`);
  });
});

describe("GET /api/apps/:id/reviews", () => {
  /** 25 reviewers whose reviews share created_at in groups of five, out of id order. */
  async function insertReviews(appId: number, count: number): Promise<StoredReview[]> {
    await db.query(
      `INSERT INTO users (username, email, password_hash)
       SELECT 'reviewer' || lpad(g::text, 2, '0'), 'reviewer' || g || '@sprout.test', 'x'
       FROM generate_series(1, $1) g`,
      [count],
    );
    await db.query(
      `INSERT INTO reviews (app_id, user_id, rating, comment, created_at)
       SELECT $1, u.id, 1 + u.id % 5, 'Review by ' || u.username,
              '2026-01-01T00:00:00Z'::timestamptz + ((u.id * 7) % 5) * interval '1 hour'
       FROM users u WHERE u.username LIKE 'reviewer%' ORDER BY u.id`,
      [appId],
    );
    return storedReviews();
  }

  it(`pages ${REVIEWS_PAGE_SIZE} at a time, newest first, then by id, with usernames and no emails`, async () => {
    const { appId } = await fixtures();
    const stored = await insertReviews(appId, 25);
    const expected = stored
      .slice()
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime() || b.id - a.id)
      .map((review) => review.id);

    const first = await call("get", reviewsPath(appId));
    const second = await call("get", `${reviewsPath(appId)}?page=2`);

    expect(first.status).toBe(200);
    expect(Object.keys(first.body).sort()).toEqual(PAGE_KEYS);
    expect(first.body).toMatchObject({
      page: 1,
      pageSize: REVIEWS_PAGE_SIZE,
      total: 25,
      mine: null,
    });
    expect(second.body).toMatchObject({
      page: 2,
      pageSize: REVIEWS_PAGE_SIZE,
      total: 25,
      mine: null,
    });
    expect(first.body.items).toHaveLength(20);
    expect(second.body.items).toHaveLength(5);
    const ids = [...first.body.items, ...second.body.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(25);
    expect(ids).toEqual(expected);
    expect(expected).not.toEqual(stored.map((review) => review.id).reverse());
    for (const item of first.body.items) {
      expect(Object.keys(item).sort()).toEqual(REVIEW_KEYS);
      expect(item.username).toMatch(/^reviewer\d{2}$/);
      expect(item.comment).toBe(`Review by ${item.username}`);
    }
    expect((await call("get", `${reviewsPath(appId)}?page=1`)).body).toEqual(first.body);
  });

  it("returns items: [] with the real total for a page past the end", async () => {
    const { riya, sam, orbit, appId } = await fixtures();
    for (const user of [riya, sam, orbit]) await put(appId, user, { rating: 4 });

    for (const page of [2, 1000]) {
      const res = await call("get", `${reviewsPath(appId)}?page=${page}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        items: [],
        page,
        pageSize: REVIEWS_PAGE_SIZE,
        total: 3,
        mine: null,
      });
    }
  });

  it("returns an empty first page for an app with no reviews", async () => {
    const { appId } = await fixtures();

    const res = await call("get", reviewsPath(appId));

    expect(res.body).toEqual({
      items: [],
      page: 1,
      pageSize: REVIEWS_PAGE_SIZE,
      total: 0,
      mine: null,
    });
  });

  it("returns 400 for page 0, 1001, abc, a fraction, an empty value or a repeated page", async () => {
    const { appId } = await fixtures();

    for (const query of [
      "page=0",
      "page=1001",
      "page=abc",
      "page=1.5",
      "page=-1",
      "page=",
      "page=1&page=2",
    ]) {
      expectValidationError(await call("get", `${reviewsPath(appId)}?${query}`), "page");
    }
  });

  it("sets mine to null when anonymous, with a garbage or expired cookie, or with no review", async () => {
    const { riya, sam, appId } = await fixtures();
    await put(appId, sam, { rating: 5, comment: "Sam's review" });
    const expired = await sessionCookie(riya.id, "user", Math.floor(Date.now() / 1000) - 60);

    for (const res of [
      await call("get", reviewsPath(appId)),
      await call("get", reviewsPath(appId), { cookie: GARBAGE_COOKIE }),
      await call("get", reviewsPath(appId), { cookie: expired }),
      await call("get", reviewsPath(appId), { as: riya }),
    ]) {
      expect(res.status).toBe(200);
      expect(res.body.mine).toBeNull();
      expect(res.body.total).toBe(1);
      expect(res.body.items).toMatchObject([{ username: "sam", comment: "Sam's review" }]);
    }
  });

  it("sets mine to the caller's own review, which items also include, never anyone else's", async () => {
    const { riya, sam, orbit, appId } = await fixtures();
    await put(appId, riya, { rating: 2, comment: "Riya's review" });
    await put(appId, sam, { rating: 5, comment: "Sam's review" });
    const { count } = await aggregate(appId);

    for (const user of [riya, sam]) {
      const res = await call("get", reviewsPath(appId), { as: user });
      expect(res.body.mine).toMatchObject({ username: user.username });
      expect(Object.keys(res.body.mine).sort()).toEqual(REVIEW_KEYS);
      expect(res.body.items).toContainEqual(res.body.mine);
      expect(res.body.total).toBe(count);
    }
    const stranger = await call("get", reviewsPath(appId), { as: orbit });
    expect(stranger.body).toMatchObject({ mine: null, total: count });
  });

  it("returns 404 for an unknown app and 400 for a malformed or out-of-range id", async () => {
    const { riya } = await fixtures();

    const missing = await call("get", reviewsPath(999), { as: riya });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(APP_NOT_FOUND);
    for (const id of BAD_IDS) expectValidationError(await call("get", reviewsPath(id)), "id");
  });
});

describe("DELETE /api/apps/:id/reviews", () => {
  it("deletes the caller's review with 204, then answers 404 the second time", async () => {
    const { riya, appId } = await fixtures();
    await put(appId, riya, { rating: 3 });

    const first = await call("delete", reviewsPath(appId), { as: riya });
    expect(first.status).toBe(204);
    expect(first.text).toBe("");
    expect((await rowCounts()).reviews).toBe(0);

    const second = await call("delete", reviewsPath(appId), { as: riya });
    expect(second.status).toBe(404);
    expect(second.body).toEqual(REVIEW_NOT_FOUND);
  });

  it("never deletes another user's review", async () => {
    const { nova, riya, sam, orbit, appId } = await fixtures();
    const otherAppId = await insertApp(nova, "Other App");
    await put(appId, riya, { rating: 3 });
    await put(appId, sam, { rating: 4 });
    await put(otherAppId, orbit, { rating: 5 });

    expect((await call("delete", reviewsPath(appId), { as: orbit })).body).toEqual(
      REVIEW_NOT_FOUND,
    );
    expect((await call("delete", reviewsPath(appId), { as: nova })).body).toEqual(REVIEW_NOT_FOUND);
    expect((await storedReviews()).map((review) => review.user_id)).toEqual([
      riya.id,
      sam.id,
      orbit.id,
    ]);

    expect((await call("delete", reviewsPath(appId), { as: riya })).status).toBe(204);
    expect(await storedReviews()).toMatchObject([
      { app_id: appId, user_id: sam.id },
      { app_id: otherAppId, user_id: orbit.id },
    ]);
  });

  it("returns 401 to anonymous callers, 404 for an unknown app and 400 for a malformed id", async () => {
    const { riya, appId } = await fixtures();
    await put(appId, riya, { rating: 3 });

    for (const res of [
      await call("delete", reviewsPath(appId)),
      await call("delete", reviewsPath(appId), { cookie: GARBAGE_COOKIE }),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    }
    expect((await rowCounts()).reviews).toBe(1);

    const missing = await call("delete", reviewsPath(999), { as: riya });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(REVIEW_NOT_FOUND);
    for (const id of BAD_IDS) {
      expectValidationError(await call("delete", reviewsPath(id), { as: riya }), "id");
    }
    expect((await rowCounts()).reviews).toBe(1);
  });
});

describe("review aggregates elsewhere", () => {
  it("GET /api/apps/:id shows the new avg_rating and review_count after each PUT and DELETE", async () => {
    const { riya, sam, appId } = await fixtures();
    expect(await aggregate(appId)).toEqual({ avg_rating: null, count: 0 });
    await put(appId, sam, { rating: 4 });

    await put(appId, riya, { rating: 1 });
    expect(await aggregate(appId)).toEqual({ avg_rating: 2.5, count: 2 });

    await put(appId, riya, { rating: 5 });
    expect(await aggregate(appId)).toEqual({ avg_rating: 4.5, count: 2 });

    await call("delete", reviewsPath(appId), { as: riya });
    expect(await aggregate(appId)).toEqual({ avg_rating: 4, count: 1 });

    await call("delete", reviewsPath(appId), { as: sam });
    expect(await aggregate(appId)).toEqual({ avg_rating: null, count: 0 });
  });

  it("the top-rated order and GET /api/developer/apps follow review writes", async () => {
    const { nova, orbit, riya, appId: novaApp } = await fixtures();
    const orbitApp = await insertApp(orbit, "Orbit App");
    const topRated = async () =>
      (await call("get", "/api/apps?sort=top-rated")).body.items.map(
        (item: { id: number }) => item.id,
      );
    const novaDashboard = async () => {
      const res = await call("get", "/api/developer/apps", { as: nova });
      expect(res.status).toBe(200);
      const item = res.body.find((row: { id: number }) => row.id === novaApp);
      return { avg_rating: item.avg_rating, count: item.review_count };
    };

    await put(novaApp, riya, { rating: 3 });
    expect(await topRated()).toEqual([novaApp, orbitApp]);
    expect(await novaDashboard()).toEqual({ avg_rating: 3, count: 1 });

    await put(orbitApp, riya, { rating: 5 });
    expect(await topRated()).toEqual([orbitApp, novaApp]);

    await put(orbitApp, riya, { rating: 1 });
    expect(await topRated()).toEqual([novaApp, orbitApp]);

    await call("delete", reviewsPath(novaApp), { as: riya });
    expect(await topRated()).toEqual([orbitApp, novaApp]);
    expect(await novaDashboard()).toEqual({ avg_rating: null, count: 0 });
  });
});

describe("cross-site writes", () => {
  it("rejects a PUT or DELETE with a foreign Origin with 403 and writes nothing", async () => {
    const { riya, appId } = await fixtures();
    const foreign = (method: "put" | "delete") => {
      const req = request(app)
        [method](reviewsPath(appId))
        .set("Cookie", riya.cookie)
        .set("Origin", "https://evil.example");
      return method === "put" ? req.send({ rating: 1 }) : req;
    };

    // Answered by the global originCheck, before the reviews router sets Cache-Control.
    const blockedPut = checked(await foreign("put"), null);
    expect(blockedPut.status).toBe(403);
    expect(blockedPut.body.error.code).toBe("FORBIDDEN");
    expect((await rowCounts()).reviews).toBe(0);

    const same = await request(app)
      .put(reviewsPath(appId))
      .set("Cookie", riya.cookie)
      .set("Origin", env.APP_URL)
      .send({ rating: 4 });
    expect(checked(same).status).toBe(200);

    const blockedDelete = checked(await foreign("delete"), null);
    expect(blockedDelete.status).toBe(403);
    expect(await storedReviews()).toMatchObject([{ user_id: riya.id, rating: 4 }]);
  });
});

describe("a row deleted mid-request (pg 23503)", () => {
  it("answers 404 when the app is deleted between the upsert's read and its foreign-key check", async () => {
    const { riya, appId } = await fixtures();

    const res = await racingCommit("DELETE FROM apps WHERE id = $1", [appId], () =>
      put(appId, riya, { rating: 4 }),
    );

    expect(res.status).toBe(404);
    expect(res.body).toEqual(APP_NOT_FOUND);
    expect(await rowCounts()).toMatchObject({ apps: 0, reviews: 0 });
  });

  it("answers 500 when the reviewer is deleted instead: only the app's foreign key is a 404", async () => {
    const { riya, appId } = await fixtures();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const res = await racingCommit("DELETE FROM users WHERE id = $1", [riya.id], () =>
        put(appId, riya, { rating: 4 }),
      );

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL");
      expect(errors).toHaveBeenCalledTimes(1);
      expect(String(errors.mock.calls[0]?.[0])).toContain("reviews_user_id_fkey");
      expect(String(errors.mock.calls[0]?.[0])).not.toContain("@sprout.test");
    } finally {
      errors.mockRestore();
    }
    expect((await rowCounts()).reviews).toBe(0);
  });

  it("upsertReview maps only a reviews_app_id_fkey violation to null and rethrows the rest", async () => {
    const failing = (code: string, constraint: string | undefined): Queryable => ({
      query: async () => {
        throw Object.assign(new DatabaseError("simulated", 0, "error"), { code, constraint });
      },
    });
    const review = { appId: 1, userId: 2, rating: 3, comment: null };

    await expect(upsertReview(failing("23503", "reviews_app_id_fkey"), review)).resolves.toBeNull();
    for (const [code, constraint] of [
      ["23503", "reviews_user_id_fkey"],
      ["23503", undefined],
      ["23505", "reviews_app_id_fkey"],
      ["57014", undefined],
    ] as const) {
      await expect(upsertReview(failing(code, constraint), review)).rejects.toMatchObject({
        code,
        constraint,
      });
    }
  });
});
