import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import type { Express } from "express";
import request, { type Response } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { requestPasswordReset } from "../src/modules/auth/auth.service.js";
import { rowCounts, useTestDb } from "./helpers/db.js";
import { fakeEmailSender, type FakeEmailSender } from "./helpers/email.js";
import { fakeStorage } from "./helpers/storage.js";

const db = useTestDb();

const OLD_PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "fresh-sprout-password";
const ALEX = { username: "alex", email: "alex@sprout.test", password: OLD_PASSWORD };
const FORGOT_BODY = '{"message":"If an account exists, a reset link has been sent."}';
const INVALID_TOKEN = {
  error: {
    code: "INVALID_OR_EXPIRED_TOKEN",
    message: "This reset link is invalid or has expired. Request a new one.",
  },
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Every response in this file goes through here: no hash or token may leave the backend (INV-4). */
function checked(res: Response): Response {
  expect(res.text).not.toContain("password_hash");
  expect(res.text).not.toContain("token_hash");
  expect(res.text).not.toContain("$2b$");
  // A raw token and its sha256 are both 64 hex characters.
  expect(res.text).not.toMatch(/[0-9a-f]{64}/);
  return res;
}

/** A fresh app (and so fresh rate limits) with a fake sender that captures its reset emails. */
function setup(email: FakeEmailSender = fakeEmailSender()): {
  app: Express;
  email: FakeEmailSender;
} {
  return { app: createApp({ db, email, storage: fakeStorage() }), email };
}

async function signUpAlex(app: Express): Promise<void> {
  expect((await request(app).post("/api/auth/signup").send(ALEX)).status).toBe(201);
}

const forgot = async (app: Express, email: string, ip = "198.51.100.1") =>
  checked(
    await request(app)
      .post("/api/auth/forgot-password")
      .set("X-Forwarded-For", ip) // TRUST_PROXY_HOPS=1 in tests
      .send({ email }),
  );

const reset = async (app: Express, body: object) =>
  checked(await request(app).post("/api/auth/reset-password").send(body));

const signIn = async (app: Express, password: string) =>
  checked(await request(app).post("/api/auth/signin").send({ email: ALEX.email, password }));

/**
 * forgot-password keeps working after it responds. This waits until no pooled connection is busy
 * or awaited, so the work can't outlive its test (and race the next test's TRUNCATE). For a known
 * email, wait for the fake's `sent` instead: the email goes out after the last query.
 */
async function backgroundSettled(): Promise<void> {
  await vi.waitFor(() => {
    expect(db.waitingCount).toBe(0);
    expect(db.idleCount).toBe(db.totalCount);
  });
}

/** Requests a reset for alex and returns the raw token from the emailed link. */
async function issueToken(app: Express, email: FakeEmailSender): Promise<string> {
  const count = email.sent.length;
  expect((await forgot(app, ALEX.email)).status).toBe(200);
  await vi.waitFor(() => expect(email.sent).toHaveLength(count + 1));
  const token = new URL(email.sent[count]?.resetUrl ?? "").searchParams.get("token");
  if (!token) throw new Error("Expected a token in the reset URL");
  return token;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/forgot-password", () => {
  it("gives a known and an unknown email byte-identical responses", async () => {
    const { app, email } = setup();
    await signUpAlex(app);

    const known = await forgot(app, ALEX.email);
    const unknown = await forgot(app, "nobody@sprout.test");
    await vi.waitFor(() => expect(email.sent).toHaveLength(1));
    await backgroundSettled();

    for (const res of [known, unknown]) {
      expect(res.status).toBe(200);
      expect(res.text).toBe(FORGOT_BODY);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    expect(known.headers["content-type"]).toBe(unknown.headers["content-type"]);
    expect(known.headers["content-length"]).toBe(unknown.headers["content-length"]);
    expect(known.headers["etag"]).toBe(unknown.headers["etag"]);
  });

  it("emails a link built from APP_URL and stores only sha256 of its token", async () => {
    const { app, email } = setup();
    await signUpAlex(app);

    const token = await issueToken(app, email);

    expect(email.sent).toEqual([
      {
        to: ALEX.email,
        username: ALEX.username,
        resetUrl: `${env.APP_URL}/reset-password?token=${token}`,
      },
    ]);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const { rows } = await db.query<{ token_hash: string; row: string; ttl: number }>(
      `SELECT token_hash, row_to_json(p)::text AS row,
              EXTRACT(EPOCH FROM expires_at - created_at)::int AS ttl
       FROM password_resets p`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toBe(sha256(token));
    expect(rows[0]?.token_hash).not.toBe(token);
    expect(rows[0]?.row).not.toContain(token);
    expect(rows[0]?.ttl).toBe(15 * 60);
  });

  it("trims and lower-cases the email before the lookup (G10)", async () => {
    const { app, email } = setup();
    await signUpAlex(app);

    expect((await forgot(app, "  ALEX@Sprout.TEST ")).status).toBe(200);

    await vi.waitFor(() => expect(email.sent).toHaveLength(1));
    expect(email.sent[0]?.to).toBe(ALEX.email);
  });

  it("does nothing for an unknown email: no row, no email", async () => {
    const email = fakeEmailSender();

    await requestPasswordReset(db, email, "nobody@sprout.test");

    expect(email.sent).toEqual([]);
    expect((await rowCounts()).password_resets).toBe(0);
  });

  it("revokes earlier tokens when a new one is requested", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    const first = await issueToken(app, email);

    const second = await issueToken(app, email);

    const { rows } = await db.query<{ token_hash: string }>(
      "SELECT token_hash FROM password_resets",
    );
    expect(rows).toEqual([{ token_hash: sha256(second) }]);
    expect((await reset(app, { token: first, password: NEW_PASSWORD })).body).toEqual(
      INVALID_TOKEN,
    );
    expect((await reset(app, { token: second, password: NEW_PASSWORD })).status).toBe(200);
  });

  it("leaves one live token when two requests for a user race", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    // Open spare connections first, so neither transaction waits for one and they interleave.
    await Promise.all(Array.from({ length: 4 }, () => db.query("SELECT pg_sleep(0.02)")));

    await Promise.all([
      requestPasswordReset(db, email, ALEX.email),
      requestPasswordReset(db, email, ALEX.email),
    ]);

    const tokens = email.sent.map(({ resetUrl }) => new URL(resetUrl).searchParams.get("token"));
    const { rows } = await db.query<{ token_hash: string }>(
      "SELECT token_hash FROM password_resets",
    );
    expect(tokens).toHaveLength(2);
    expect(rows).toHaveLength(1);
    expect(tokens.map((token) => sha256(token ?? ""))).toContain(rows[0]?.token_hash);
  });

  it("still answers the same 200 when sending fails, and logs no email, token or link", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { app, email } = setup(fakeEmailSender({ fails: true }));
    await signUpAlex(app);

    const res = await forgot(app, ALEX.email);
    await vi.waitFor(() => expect(logged).toHaveBeenCalledOnce());

    expect(res.status).toBe(200);
    expect(res.text).toBe(FORGOT_BODY);
    const { resetUrl } = email.sent[0] ?? { resetUrl: "" };
    const token = new URL(resetUrl).searchParams.get("token") ?? "";
    const output = logged.mock.calls.flat().join(" ");
    expect(output).toContain("Password reset request failed: Error: Resend rejected");
    for (const secret of [ALEX.email, resetUrl, token, sha256(token)]) {
      expect(output).not.toContain(secret);
    }
  });

  it("returns 400 VALIDATION_ERROR for a malformed email and sends nothing", async () => {
    const { app, email } = setup();

    const res = await forgot(app, "not-an-email");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details.email).toBeDefined();
    expect(email.sent).toEqual([]);
  });

  it("returns 429 RATE_LIMITED on the 4th request from one IP within 15 minutes", async () => {
    const { app } = setup();

    for (let i = 1; i <= 3; i++) {
      expect((await forgot(app, `nobody${i}@sprout.test`, "203.0.113.1")).status).toBe(200);
    }
    const limited = await forgot(app, "nobody4@sprout.test", "203.0.113.1");
    const otherIp = await forgot(app, "nobody5@sprout.test", "203.0.113.2");
    await backgroundSettled();

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many reset requests. Try again in 15 minutes." },
    });
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(otherIp.status).toBe(200);
  });

  it("counts malformed requests against the IP limit too", async () => {
    const { app } = setup();
    const post = () =>
      request(app).post("/api/auth/forgot-password").set("X-Forwarded-For", "203.0.113.9").send({});

    for (let i = 1; i <= 3; i++) {
      expect((await post()).status).toBe(400);
    }
    expect((await post()).status).toBe(429);
  });

  it("returns 429 on the 4th request for one email, from any IP and in any case", async () => {
    const { app } = setup();

    const variants = ["nobody@sprout.test", "NOBODY@sprout.test", " nobody@SPROUT.test "];
    for (const [i, variant] of variants.entries()) {
      expect((await forgot(app, variant, `203.0.113.${i + 1}`)).status).toBe(200);
    }
    const limited = await forgot(app, "nobody@sprout.test", "203.0.113.4");
    const otherEmail = await forgot(app, "somebody@sprout.test", "203.0.113.5");
    await backgroundSettled();

    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
    // The email's window belongs to whoever asked first; don't tell this caller when it ends.
    expect(limited.headers["retry-after"]).toBeUndefined();
    expect(otherEmail.status).toBe(200);
  });

  it("doesn't reveal other clients' requests for an email in the RateLimit headers", async () => {
    const { app } = setup();
    await forgot(app, "victim@sprout.test", "203.0.113.1");

    const probe = await forgot(app, "victim@sprout.test", "203.0.113.2");
    const fresh = await forgot(app, "fresh@sprout.test", "203.0.113.3");
    await backgroundSettled();

    // Only the caller's own IP budget is reported, so both look like a first request.
    for (const res of [probe, fresh]) {
      expect(res.headers["ratelimit"]).toMatch(/^"[^"]+"; r=2; t=\d+$/);
      expect(res.headers["ratelimit-policy"]).toMatch(/^"[^"]+"; q=3; w=900; pk=:[^:]+:$/);
    }
  });
});

describe("POST /api/auth/reset-password", () => {
  it("sets the new password: the old one fails, the new one works", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    const token = await issueToken(app, email);

    const res = await reset(app, { token, password: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: "Your password has been reset. Sign in with your new password.",
    });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["set-cookie"]).toBeUndefined(); // no auto-sign-in
    expect((await signIn(app, OLD_PASSWORD)).status).toBe(401);
    expect((await signIn(app, NEW_PASSWORD)).status).toBe(200);
    expect((await rowCounts()).password_resets).toBe(0);
  });

  it("accepts a token exactly once", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    const token = await issueToken(app, email);
    expect((await reset(app, { token, password: NEW_PASSWORD })).status).toBe(200);

    const again = await reset(app, { token, password: "another-new-password" });

    expect(again.status).toBe(400);
    expect(again.body).toEqual(INVALID_TOKEN);
    expect((await signIn(app, NEW_PASSWORD)).status).toBe(200);
  });

  it("lets only one of two concurrent resets with the same token through", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    const token = await issueToken(app, email);

    const results = await Promise.all([
      reset(app, { token, password: "first-new-password" }),
      reset(app, { token, password: "second-new-password" }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 400]);
    const winner = results[0]?.status === 200 ? "first-new-password" : "second-new-password";
    const loser = winner === "first-new-password" ? "second-new-password" : "first-new-password";
    expect((await signIn(app, winner)).status).toBe(200);
    expect((await signIn(app, loser)).status).toBe(401);
  });

  it("returns 400 for an expired token and keeps the old password", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    const token = await issueToken(app, email);
    await db.query("UPDATE password_resets SET expires_at = NOW() - INTERVAL '1 minute'");

    const res = await reset(app, { token, password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(INVALID_TOKEN);
    expect((await signIn(app, OLD_PASSWORD)).status).toBe(200);
  });

  it("returns 400 for an unknown token without spending a bcrypt hash", async () => {
    const { app } = setup();
    await signUpAlex(app);
    const hash = vi.spyOn(bcrypt, "hash");

    const res = await reset(app, {
      token: randomBytes(32).toString("hex"),
      password: NEW_PASSWORD,
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual(INVALID_TOKEN);
    expect(hash).not.toHaveBeenCalled();
  });

  it("revokes every other reset row the user has", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    const token = await issueToken(app, email);
    const other = randomBytes(32).toString("hex");
    await db.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       SELECT id, $1, NOW() + INTERVAL '15 minutes' FROM users WHERE email = $2`,
      [sha256(other), ALEX.email],
    );

    expect((await reset(app, { token, password: NEW_PASSWORD })).status).toBe(200);

    expect((await rowCounts()).password_resets).toBe(0);
    expect((await reset(app, { token: other, password: "another-new-password" })).body).toEqual(
      INVALID_TOKEN,
    );
  });

  it("validates the token format and the new password without consuming the token", async () => {
    const { app, email } = setup();
    await signUpAlex(app);
    const token = await issueToken(app, email);

    const badToken = await reset(app, { token: "not-a-token", password: NEW_PASSWORD });
    const upperCase = await reset(app, { token: token.toUpperCase(), password: NEW_PASSWORD });
    const shortPassword = await reset(app, { token, password: "short" });
    const longPassword = await reset(app, { token, password: "é".repeat(37) }); // 74 bytes

    for (const res of [badToken, upperCase]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.token).toEqual(["Invalid reset token"]);
    }
    expect(shortPassword.body.error.details.password).toBeDefined();
    expect(longPassword.body.error.details.password).toEqual(["Must be at most 72 bytes"]);
    expect((await reset(app, { token, password: NEW_PASSWORD })).status).toBe(200);
  });

  it("returns 429 RATE_LIMITED on the 11th attempt within a minute, per client IP", async () => {
    const { app } = setup();
    const attempt = () =>
      request(app)
        .post("/api/auth/reset-password")
        .set("X-Forwarded-For", "203.0.113.7")
        .send({ token: randomBytes(32).toString("hex"), password: NEW_PASSWORD });

    for (let i = 1; i <= 10; i++) {
      expect((await attempt()).status).toBe(400);
    }
    const limited = await attempt();

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." },
    });
  });
});
