import bcrypt from "bcrypt";
import request, { type Response } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { rowCounts, useTestDb } from "./helpers/db.js";

const db = useTestDb();

type Agent = ReturnType<typeof request.agent>;

const PASSWORD = "correct-horse-battery";
const ALEX = { username: "alex", email: "alex@sprout.test", password: PASSWORD, role: "user" };
const NOVA = { username: "nova", email: "nova@sprout.test", password: PASSWORD, role: "developer" };

/** A fresh app (and so fresh rate limits) whose agent keeps cookies between requests. */
function newAgent(): Agent {
  return request.agent(createApp({ db }));
}

/** Every auth response in this file goes through here: no hash may ever leave the backend (INV-4). */
function checked(res: Response): Response {
  expect(res.text).not.toContain("password_hash");
  expect(res.text).not.toContain("$2b$");
  return res;
}

const signUp = async (agent: Agent, body: object) =>
  checked(await agent.post("/api/auth/signup").send(body));
const signIn = async (agent: Agent, body: object) =>
  checked(await agent.post("/api/auth/signin").send(body));
const me = async (agent: Agent) => checked(await agent.get("/api/auth/me"));

function sessionCookie(res: Response): string {
  const cookie = res.get("Set-Cookie")?.find((value) => value.startsWith("sprout_session="));
  if (!cookie) throw new Error("Expected a sprout_session Set-Cookie header");
  return cookie;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/signup", () => {
  it("returns 201 with the public user and sets the session cookie", async () => {
    const res = await signUp(newAgent(), ALEX);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 1, username: "alex", email: "alex@sprout.test", role: "user" });
    expect(res.headers["cache-control"]).toBe("no-store");

    const cookie = sessionCookie(res);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).not.toContain("Secure"); // NODE_ENV=test; Secure is production-only
  });

  it("stores a cost-12 bcrypt hash, never the password", async () => {
    await signUp(newAgent(), ALEX);

    const { rows } = await db.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE email = $1",
      [ALEX.email],
    );
    const hash = rows[0]?.password_hash ?? "";
    expect(hash).toMatch(/^\$2b\$12\$/);
    expect(await bcrypt.compare(PASSWORD, hash)).toBe(true);
  });

  it("defaults the role to user and accepts developer", async () => {
    const { role: _role, ...withoutRole } = ALEX;
    expect((await signUp(newAgent(), withoutRole)).body.role).toBe("user");
    expect((await signUp(newAgent(), NOVA)).body.role).toBe("developer");
  });

  it("trims and lower-cases the email before storing it (G10)", async () => {
    const res = await signUp(newAgent(), { ...ALEX, email: "  Alex@Sprout.TEST " });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("alex@sprout.test");
  });

  it("returns 409 for a duplicate email, even in different case", async () => {
    const agent = newAgent();
    await signUp(agent, ALEX);

    const res = await signUp(agent, { ...ALEX, username: "alex2", email: "ALEX@sprout.test" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: "CONFLICT",
        message: "That email is already in use.",
        details: { email: ["Already in use."] },
      },
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect((await rowCounts()).users).toBe(1);
  });

  it("returns 409 for a duplicate username", async () => {
    const agent = newAgent();
    await signUp(agent, ALEX);

    const res = await signUp(agent, { ...ALEX, email: "other@sprout.test" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(res.body.error.details).toEqual({ username: ["Already in use."] });
    // pg's detail ("Key (username)=(alex)") is never forwarded.
    expect(res.text).not.toContain("Key (");
  });

  it("returns 400 VALIDATION_ERROR with per-field details", async () => {
    const res = await signUp(newAgent(), {
      username: "a!",
      email: "not-an-email",
      password: "short",
      role: "admin",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details).sort()).toEqual([
      "email",
      "password",
      "role",
      "username",
    ]);
    expect((await rowCounts()).users).toBe(0);
  });

  it("rejects a password over 72 UTF-8 bytes even when it is under 72 characters", async () => {
    const res = await signUp(newAgent(), { ...ALEX, password: "é".repeat(40) }); // 40 chars, 80 bytes

    expect(res.status).toBe(400);
    expect(res.body.error.details.password).toEqual(["Must be at most 72 bytes"]);
  });
});

describe("POST /api/auth/signin", () => {
  it("returns 200 with the public user and sets the session cookie", async () => {
    await signUp(newAgent(), ALEX);
    const agent = newAgent();

    const res = await signIn(agent, { email: " ALEX@sprout.test", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 1, username: "alex", email: "alex@sprout.test", role: "user" });
    expect(sessionCookie(res)).toContain("HttpOnly");
    expect((await me(agent)).status).toBe(200);
  });

  it("returns identical 401 bodies for a wrong password and an unknown email", async () => {
    const agent = newAgent();
    await signUp(agent, ALEX);

    const wrongPassword = await signIn(agent, { email: ALEX.email, password: "wrong-password" });
    const unknownEmail = await signIn(agent, { email: "nobody@sprout.test", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.text).toBe(unknownEmail.text);
    expect(wrongPassword.body).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." },
    });
    expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
    expect(unknownEmail.headers["set-cookie"]).toBeUndefined();
  });

  it("still runs a cost-12 bcrypt compare when the email is unknown", async () => {
    const compare = vi.spyOn(bcrypt, "compare");

    await signIn(newAgent(), { email: "nobody@sprout.test", password: PASSWORD });

    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0]?.[1]).toMatch(/^\$2b\$12\$/);
  });

  it("rejects a password whose first 72 bytes match but which is longer", async () => {
    const agent = newAgent();
    const password = "p".repeat(72);
    await signUp(agent, { ...ALEX, password });

    expect((await signIn(agent, { email: ALEX.email, password })).status).toBe(200);
    const res = await signIn(agent, { email: ALEX.email, password: `${password}x` });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns 400 for a malformed body, without applying the signup password rules", async () => {
    const agent = newAgent();

    expect((await signIn(agent, { email: ALEX.email })).status).toBe(400);
    // A short password is a credential failure (401), not a validation hint (400).
    expect((await signIn(agent, { email: ALEX.email, password: "x" })).status).toBe(401);
  });

  it(
    "returns 429 RATE_LIMITED on the 11th attempt within a minute, per client IP",
    { timeout: 20_000 },
    async () => {
      const agent = newAgent();
      const attempt = (ip: string) =>
        agent
          .post("/api/auth/signin")
          .set("X-Forwarded-For", ip) // TRUST_PROXY_HOPS=1 in tests
          .send({ email: "nobody@sprout.test", password: PASSWORD });

      for (let i = 1; i <= 10; i++) {
        expect((await attempt("203.0.113.1")).status).toBe(401);
      }
      const limited = await attempt("203.0.113.1");

      expect(limited.status).toBe(429);
      expect(limited.body).toEqual({
        error: { code: "RATE_LIMITED", message: "Too many attempts. Try again in a minute." },
      });
      expect(limited.headers["retry-after"]).toBeDefined();
      expect(limited.headers["ratelimit-policy"]).toBeDefined();
      // Another client behind the same proxy has its own budget.
      expect((await attempt("203.0.113.2")).status).toBe(401);
    },
  );

  it("limits signup separately from signin", async () => {
    const agent = newAgent();
    for (let i = 1; i <= 10; i++) {
      await agent.post("/api/auth/signup").send({});
    }

    expect((await agent.post("/api/auth/signup").send({})).status).toBe(429);
    expect((await signIn(agent, { email: "nobody@sprout.test", password: PASSWORD })).status).toBe(
      401,
    );
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 UNAUTHENTICATED without a cookie", async () => {
    const res = await me(newAgent());

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
    });
  });

  it("returns 200 with the same shape as signup when signed in", async () => {
    const agent = newAgent();
    const signedUp = await signUp(agent, NOVA);

    const res = await me(agent);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(signedUp.body);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("returns 401 for the old cookie once the user is deleted", async () => {
    const agent = newAgent();
    const { body } = await signUp(agent, ALEX);
    expect((await me(agent)).status).toBe(200);

    await db.query("DELETE FROM users WHERE id = $1", [body.id]);

    const res = await me(agent);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("reflects a role change on the next request instead of the JWT's role claim", async () => {
    const agent = newAgent();
    const { body } = await signUp(agent, ALEX);

    await db.query("UPDATE users SET role = 'developer' WHERE id = $1", [body.id]);

    expect((await me(agent)).body.role).toBe("developer");
  });
});

describe("POST /api/auth/signout", () => {
  it("returns 204 and expires the cookie with the same attributes", async () => {
    const agent = newAgent();
    await signUp(agent, ALEX);

    const res = await agent.post("/api/auth/signout");

    expect(res.status).toBe(204);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/^sprout_session=;/);
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect((await me(agent)).status).toBe(401);
  });
});
