import cookieParser from "cookie-parser";
import express from "express";
import { SignJWT } from "jose";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { optionalAuth, requireAuth, requireRole } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/errorHandler.js";
import { useTestDb } from "./helpers/db.js";

const db = useTestDb();

const PASSWORD = "correct-horse-battery";
const secret = new TextEncoder().encode(env.JWT_SECRET);

/** Signs up through the real app and returns the `name=value` part of its session cookie. */
async function signUpCookie(role: "developer" | "user"): Promise<string> {
  const res = await request(createApp({ db }))
    .post("/api/auth/signup")
    .send({ username: role, email: `${role}@sprout.test`, password: PASSWORD, role });
  const cookie = res.get("Set-Cookie")?.find((value) => value.startsWith("sprout_session="));
  if (!cookie) throw new Error("Expected a sprout_session Set-Cookie header");
  return cookie.split(";")[0] ?? "";
}

/** Phase 3 has no developer-only route yet, so mount the middleware on a throwaway app. */
function guardedApp() {
  return express()
    .use(cookieParser())
    .get("/developer-only", requireAuth(db), requireRole("developer"), (req, res) => {
      res.json({ id: req.user?.id });
    })
    .get("/maybe-signed-in", optionalAuth(db), (req, res) => {
      res.json({ user: req.user ?? null });
    })
    .use(errorHandler);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requireRole('developer')", () => {
  it("returns 403 FORBIDDEN for a user", async () => {
    const res = await request(guardedApp())
      .get("/developer-only")
      .set("Cookie", await signUpCookie("user"));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: "FORBIDDEN", message: "Not allowed." } });
  });

  it("lets a developer through", async () => {
    const res = await request(guardedApp())
      .get("/developer-only")
      .set("Cookie", await signUpCookie("developer"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1 });
  });

  it("returns 401 (not 403) without a session", async () => {
    const res = await request(guardedApp()).get("/developer-only");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("requireAuth token checks", () => {
  const meWith = (token: string) =>
    request(createApp({ db })).get("/api/auth/me").set("Cookie", `sprout_session=${token}`);

  async function sign(claims: { sub: string; alg?: string; exp?: number | string | null }) {
    const jwt = new SignJWT({ role: "user" })
      .setProtectedHeader({ alg: claims.alg ?? "HS256" })
      .setSubject(claims.sub)
      .setIssuedAt();
    if (claims.exp !== null) jwt.setExpirationTime(claims.exp ?? "7d");
    return jwt.sign(secret);
  }

  it("accepts a token it signed", async () => {
    await signUpCookie("user");
    expect((await meWith(await sign({ sub: "1" }))).status).toBe(200);
  });

  it.each([
    ["garbage", async () => "not-a-jwt"],
    ["a tampered signature", async () => `${(await sign({ sub: "1" })).slice(0, -2)}xx`],
    ["an expired token", async () => sign({ sub: "1", exp: Math.floor(Date.now() / 1000) - 60 })],
    ["a token without an expiry", async () => sign({ sub: "1", exp: null })],
    ["another algorithm (HS512)", async () => sign({ sub: "1", alg: "HS512" })],
    ["a non-numeric subject", async () => sign({ sub: "abc" })],
    ["a subject beyond the int4 range", async () => sign({ sub: "99999999999" })],
  ])("returns 401 for %s", async (_label, makeToken) => {
    await signUpCookie("user");

    const res = await meWith(await makeToken());

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("optionalAuth", () => {
  it("continues anonymously without a cookie or with a bad one", async () => {
    const app = guardedApp();

    expect((await request(app).get("/maybe-signed-in")).body).toEqual({ user: null });
    const bad = await request(app).get("/maybe-signed-in").set("Cookie", "sprout_session=nope");
    expect(bad.status).toBe(200);
    expect(bad.body).toEqual({ user: null });
  });

  it("attaches the user when signed in", async () => {
    const res = await request(guardedApp())
      .get("/maybe-signed-in")
      .set("Cookie", await signUpCookie("user"));

    expect(res.body).toEqual({
      user: { id: 1, username: "user", email: "user@sprout.test", role: "user" },
    });
  });
});

describe("originCheck", () => {
  it("rejects a state-changing request from a foreign Origin with 403", async () => {
    const res = await request(createApp({ db }))
      .post("/api/auth/signout")
      .set("Origin", "https://evil.example");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { code: "FORBIDDEN", message: "Cross-origin request rejected." },
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("allows the frontend's own Origin and requests without one", async () => {
    const app = createApp({ db });

    expect((await request(app).post("/api/auth/signout").set("Origin", env.APP_URL)).status).toBe(
      204,
    );
    expect((await request(app).post("/api/auth/signout")).status).toBe(204);
  });

  it("leaves GET requests alone", async () => {
    const res = await request(createApp({ db }))
      .get("/api/auth/me")
      .set("Origin", "https://evil.example");

    expect(res.status).toBe(401); // reached requireAuth, not blocked
  });
});

describe("error envelope", () => {
  it("returns 404 NOT_FOUND as JSON for an unmatched route", async () => {
    const res = await request(createApp({ db })).get("/api/nope");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Not found." } });
  });

  it("returns 400 VALIDATION_ERROR for malformed JSON without echoing it", async () => {
    const res = await request(createApp({ db }))
      .post("/api/auth/signin")
      .set("Content-Type", "application/json")
      .send('{"email": "leak-me@sprout.test", ');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON." },
    });
    expect(res.text).not.toContain("leak-me");
  });

  it("returns 413 VALIDATION_ERROR for a body over 100kb", async () => {
    const res = await request(createApp({ db }))
      .post("/api/auth/signin")
      .send({ email: "a@sprout.test", password: "x".repeat(110_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 400 VALIDATION_ERROR when the body is missing", async () => {
    const res = await request(createApp({ db })).post("/api/auth/signin");

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input: expected object, received undefined",
        details: {},
      },
    });
  });

  it("returns a generic 500 and logs the stack without pg's detail", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = express()
      .get("/boom", () => {
        throw Object.assign(new Error("boom"), {
          detail: "Failing row contains (1, alex, $2b$12$secret-hash)",
        });
      })
      .use(errorHandler);

    const res = await request(app).get("/boom");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL", message: "Something went wrong. Please try again." },
    });
    expect(res.text).not.toContain("boom");
    const output = logged.mock.calls.flat().join(" ");
    expect(output).toContain("GET /boom failed: Error: boom");
    expect(output).not.toContain("$2b$");
  });
});
