import type { Express } from "express";
import { SignJWT } from "jose";
import request, { type Response } from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { DOWNLOADS_PER_MINUTE, UPLOADS_PER_HOUR } from "../src/modules/apps/apps.routes.js";
import { MAX_BINARY_BYTES, MAX_ICON_BYTES } from "../src/modules/apps/apps.schemas.js";
import { rowCounts, useTestDb } from "./helpers/db.js";
import { fakeEmailSender } from "./helpers/email.js";
import { fakeStorage, type FakeStorage } from "./helpers/storage.js";

const db = useTestDb();

const BINARIES = env.GCS_BINARY_BUCKET;
const ICONS = env.GCS_ICON_BUCKET;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const SOME_UUID = "0b5c4c43-2d1e-4b8e-9f3a-5d6c7e8f9a0b";
const secret = new TextEncoder().encode(env.JWT_SECRET);

const APP_FIELDS = {
  title: "Focus Timer",
  tagline: "Work in short sprints",
  description: "A distraction-free pomodoro timer.",
  category: "Productivity",
  version: "1.6.0",
};
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
const NOT_FOUND = { error: { code: "NOT_FOUND", message: "App not found." } };
const FILES = {
  binary: { filename: "focus-timer.zip", contentType: "application/zip" },
  icon: { filename: "icon.png", contentType: "image/png" },
};

type Method = "get" | "post" | "patch" | "delete";
interface User {
  id: number;
  cookie: string;
}

/** Every response in this file goes through here: file_url and gs:// URLs never leave (INV-4). */
function checked(res: Response): Response {
  expect(res.text ?? "").not.toContain("file_url");
  expect(res.text ?? "").not.toContain("gs://");
  expect(JSON.stringify(res.headers)).not.toContain("gs://");
  return res;
}

/** A fresh app (and so fresh rate limits) on its own fake storage. */
function setup(storage: FakeStorage = fakeStorage()): { app: Express; storage: FakeStorage } {
  return { app: createApp({ db, email: fakeEmailSender(), storage }), storage };
}

/** Inserts a user and signs a session cookie for them, skipping signup's bcrypt rounds. */
async function createUser(
  username: string,
  role: "developer" | "user" = "developer",
): Promise<User> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO users (username, email, password_hash, role)
     VALUES ($1, $2, 'not-a-real-hash', $3) RETURNING id`,
    [username, `${username}@sprout.test`, role],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("Expected a user id");
  const token = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(id))
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
  return { id, cookie: `sprout_session=${token}` };
}

async function call(
  app: Express,
  method: Method,
  path: string,
  { as, body, ip }: { as?: User; body?: object; ip?: string } = {},
): Promise<Response> {
  let req = request(app)[method](path);
  if (as) req = req.set("Cookie", as.cookie);
  if (ip) req = req.set("X-Forwarded-For", ip); // TRUST_PROXY_HOPS=1 in tests
  return checked(await (body === undefined ? req : req.send(body)));
}

/** Gets an upload URL, then "PUTs" the file into the fake bucket. Returns the key. */
async function upload(
  app: Express,
  storage: FakeStorage,
  user: User,
  kind: "binary" | "icon",
  filename = FILES[kind].filename,
): Promise<string> {
  const res = await call(app, "post", "/api/apps/uploads", {
    as: user,
    body: { kind, filename, contentType: FILES[kind].contentType, size: 1024 },
  });
  expect(res.status).toBe(200);
  const key: string = res.body.key;
  storage.put(kind === "binary" ? BINARIES : ICONS, key);
  return key;
}

/** Uploads a binary and an icon, then creates the app. */
async function publish(
  app: Express,
  storage: FakeStorage,
  user: User,
  fields: object = {},
): Promise<{ id: number; binaryKey: string; iconKey: string }> {
  const binaryKey = await upload(app, storage, user, "binary");
  const iconKey = await upload(app, storage, user, "icon");
  const res = await call(app, "post", "/api/apps", {
    as: user,
    body: { ...APP_FIELDS, binaryKey, iconKey, ...fields },
  });
  expect(res.status).toBe(201);
  return { id: res.body.id, binaryKey, iconKey };
}

async function storedRow(id: number): Promise<Record<string, unknown> | undefined> {
  const { rows } = await db.query("SELECT * FROM apps WHERE id = $1", [id]);
  return rows[0];
}

async function downloadCount(id: number): Promise<number | undefined> {
  const { rows } = await db.query<{ download_count: number }>(
    "SELECT download_count FROM apps WHERE id = $1",
    [id],
  );
  return rows[0]?.download_count;
}

function addReview(appId: number, userId: number, rating: number) {
  return db.query("INSERT INTO reviews (app_id, user_id, rating) VALUES ($1, $2, $3)", [
    appId,
    userId,
    rating,
  ]);
}

const logOutput = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.flat().join(" ");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("developer-only routes", () => {
  it("return 401 for anonymous callers and 403 for the user role (uploads, create, update, delete, list)", async () => {
    const { app, storage } = setup();
    const alex = await createUser("alex", "user");
    const routes: [Method, string][] = [
      ["post", "/api/apps/uploads"],
      ["post", "/api/apps"],
      ["patch", "/api/apps/1"],
      ["delete", "/api/apps/1"],
      ["get", "/api/developer/apps"],
    ];

    for (const [method, path] of routes) {
      const body = method === "get" || method === "delete" ? undefined : {};
      const anonymous = await call(app, method, path, { body });
      const user = await call(app, method, path, { as: alex, body });

      expect(anonymous.status).toBe(401);
      expect(anonymous.body.error.code).toBe("UNAUTHENTICATED");
      expect(anonymous.headers["cache-control"]).toBe("no-store");
      expect(user.status).toBe(403);
      expect(user.body).toEqual({ error: { code: "FORBIDDEN", message: "Not allowed." } });
    }
    expect(storage.uploads).toEqual([]);
  });
});

describe("POST /api/apps/uploads", () => {
  it("signs a binary PUT under the caller's prefix as octet-stream with the 500 MiB cap", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");

    const res = await call(app, "post", "/api/apps/uploads", {
      as: nova,
      body: {
        kind: "binary",
        filename: "focus-timer.zip",
        contentType: "application/zip",
        size: 4096,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body).sort()).toEqual(["headers", "key", "uploadUrl"]);
    expect(res.body.key).toMatch(new RegExp(`^uploads/${nova.id}/${UUID}/focus-timer\\.zip$`));
    // The cap is the kind's, not the declared size; the client's type is never signed.
    expect(storage.uploads).toEqual([
      {
        bucket: BINARIES,
        key: res.body.key,
        contentType: "application/octet-stream",
        maxBytes: MAX_BINARY_BYTES,
      },
    ]);
    expect(res.body.uploadUrl).toBe(`https://upload.fake-gcs.test/${BINARIES}/${res.body.key}`);
    expect(res.body.headers).toEqual({
      "Content-Type": "application/octet-stream",
      "x-goog-content-length-range": `0,${MAX_BINARY_BYTES}`,
    });
  });

  it("signs an icon PUT in the icons bucket with its image type and the 1 MiB cap", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");

    const res = await call(app, "post", "/api/apps/uploads", {
      as: nova,
      body: { kind: "icon", filename: "Icon.JPEG", contentType: "image/jpeg", size: 2048 },
    });

    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(new RegExp(`^uploads/${nova.id}/${UUID}/Icon\\.JPEG$`));
    expect(storage.uploads).toEqual([
      { bucket: ICONS, key: res.body.key, contentType: "image/jpeg", maxBytes: MAX_ICON_BYTES },
    ]);
  });

  it("issues a new key for every request", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");

    const first = await upload(app, storage, nova, "binary");
    const second = await upload(app, storage, nova, "binary");

    expect(first).not.toBe(second);
  });

  it("accepts .AppImage with an empty contentType and an upper-case .ZIP", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");

    for (const filename of ["json-lens.AppImage", "GAME.ZIP", "tool.deb", "Installer.pkg"]) {
      const res = await call(app, "post", "/api/apps/uploads", {
        as: nova,
        body: { kind: "binary", filename, contentType: "", size: 10 },
      });
      expect(res.status).toBe(200);
      expect(res.body.key.endsWith(`/${filename}`)).toBe(true);
    }
    expect(storage.uploads.map((u) => u.contentType)).toEqual(
      Array(4).fill("application/octet-stream"),
    );
  });

  it("puts a sanitized basename in the key: safe characters, no leading dots, 100 characters", async () => {
    const { app } = setup();
    const nova = await createUser("nova");
    const cases: [string, string][] = [
      ["../../etc/My App (final).zip", "My-App-final-.zip"],
      ["C:\\Users\\nova\\.hidden.dmg", "hidden.dmg"],
      ["--résumé builder.exe", "r-sum-builder.exe"],
      ['a"b;c\r\nd.apk', "a-b-c-d.apk"],
      [`${"a".repeat(150)}.AppImage`, `${"a".repeat(91)}.AppImage`],
      // A stem with nothing safe left keeps its extension under a stand-in name.
      ["日本.zip", "file.zip"],
      ["/.zip", "file.zip"],
    ];

    for (const [filename, expected] of cases) {
      const res = await call(app, "post", "/api/apps/uploads", {
        as: nova,
        body: { kind: "binary", filename, contentType: "", size: 10 },
      });
      expect(res.status, filename).toBe(200);
      expect(res.body.key).toMatch(new RegExp(`^uploads/${nova.id}/${UUID}/[^/]+$`));
      expect(res.body.key.split("/").at(-1)).toBe(expected);
    }
    const icon = await call(app, "post", "/api/apps/uploads", {
      as: nova,
      body: { kind: "icon", filename: "图标.png", contentType: "image/png", size: 10 },
    });
    expect(icon.body.key.split("/").at(-1)).toBe("file.png");
  });

  it(`returns 429 after ${UPLOADS_PER_HOUR} requests in an hour from one account`, async () => {
    const { app } = setup();
    const nova = await createUser("nova");
    const orbit = await createUser("orbit");
    const ask = (user: User) =>
      call(app, "post", "/api/apps/uploads", {
        as: user,
        body: { kind: "binary", filename: "a.zip", contentType: "", size: 10 },
      });

    for (let i = 1; i <= UPLOADS_PER_HOUR; i++) {
      expect((await ask(nova)).status).toBe(200);
    }
    const limited = await ask(nova);
    const otherAccount = await ask(orbit);

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many uploads. Try again later." },
    });
    expect(otherAccount.status).toBe(200);
  });

  it("returns 400 for SVG, disallowed extensions or types, and oversize or empty files", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const cases: [object, string][] = [
      [
        { kind: "icon", filename: "logo.svg", contentType: "image/svg+xml", size: 100 },
        "contentType",
      ],
      [
        { kind: "icon", filename: "logo.png", contentType: "image/svg+xml", size: 100 },
        "contentType",
      ],
      [{ kind: "icon", filename: "logo.svg", contentType: "image/png", size: 100 }, "filename"],
      [{ kind: "icon", filename: "logo.jpg", contentType: "image/png", size: 100 }, "filename"],
      [{ kind: "icon", filename: "logo.gif", contentType: "image/gif", size: 100 }, "contentType"],
      [{ kind: "binary", filename: "install.sh", contentType: "", size: 100 }, "filename"],
      [{ kind: "binary", filename: "app.zip.sh", contentType: "", size: 100 }, "filename"],
      [{ kind: "binary", filename: "", contentType: "", size: 100 }, "filename"],
      [{ kind: "binary", filename: "a.zip", contentType: "", size: MAX_BINARY_BYTES + 1 }, "size"],
      [{ kind: "binary", filename: "a.zip", contentType: "", size: 0 }, "size"],
      [{ kind: "binary", filename: "a.zip", contentType: "", size: 1.5 }, "size"],
      [
        { kind: "icon", filename: "i.png", contentType: "image/png", size: MAX_ICON_BYTES + 1 },
        "size",
      ],
      [{ kind: "script", filename: "a.zip", contentType: "", size: 1 }, "kind"],
    ];

    for (const [body, field] of cases) {
      const res = await call(app, "post", "/api/apps/uploads", { as: nova, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details[field], JSON.stringify(body)).toBeDefined();
    }
    expect(storage.uploads).toEqual([]);
  });

  it("answers 500 when signing fails, and logs neither the bucket nor the key", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const leakyKey = `uploads/${nova.id}/${SOME_UUID}/a.zip`;
    vi.spyOn(storage, "createUploadUrl").mockRejectedValue(
      Object.assign(new Error(`Cannot sign gs://${BINARIES}/${leakyKey}`), {
        name: "SigningError",
      }),
    );

    const res = await call(app, "post", "/api/apps/uploads", {
      as: nova,
      body: { kind: "binary", filename: "a.zip", contentType: "", size: 10 },
    });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    const output = logOutput(logged);
    expect(output).toContain("Storage upload URL failed: SigningError");
    expect(output).not.toContain(BINARIES);
    expect(output).not.toContain(leakyKey);
  });
});

describe("POST /api/apps", () => {
  it("creates the app from verified uploads and returns it without file_url", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const binaryKey = await upload(app, storage, nova, "binary");
    const iconKey = await upload(app, storage, nova, "icon");

    const res = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, title: "  Focus Timer  ", binaryKey, iconKey },
    });

    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body).sort()).toEqual(PUBLIC_APP_KEYS);
    expect(res.body).toMatchObject({
      ...APP_FIELDS,
      developer_id: nova.id,
      download_count: 0,
      icon_url: `https://storage.googleapis.com/${ICONS}/${iconKey}`,
    });
    expect(new Date(res.body.created_at).toISOString()).toBe(res.body.created_at);
    const row = await storedRow(res.body.id);
    expect(row?.file_url).toBe(`gs://${BINARIES}/${binaryKey}`);
    expect(row?.icon_url).toBe(res.body.icon_url);
  });

  it("stores a null icon_url when no icon is given", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const binaryKey = await upload(app, storage, nova, "binary");

    const res = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, binaryKey },
    });

    expect(res.status).toBe(201);
    expect(res.body.icon_url).toBeNull();
  });

  it("returns 403 for a key under another developer's prefix, even though the object exists", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const orbit = await createUser("orbit");
    const novaBinary = await upload(app, storage, nova, "binary");
    const novaIcon = await upload(app, storage, nova, "icon");
    const orbitBinary = await upload(app, storage, orbit, "binary");

    const binary = await call(app, "post", "/api/apps", {
      as: orbit,
      body: { ...APP_FIELDS, binaryKey: novaBinary },
    });
    const icon = await call(app, "post", "/api/apps", {
      as: orbit,
      body: { ...APP_FIELDS, binaryKey: orbitBinary, iconKey: novaIcon },
    });

    for (const res of [binary, icon]) {
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: { code: "FORBIDDEN", message: "That upload belongs to another account." },
      });
    }
    expect((await rowCounts()).apps).toBe(0);
  });

  it("returns 400 for keys that aren't exactly what /uploads issues", async () => {
    const { app } = setup();
    const nova = await createUser("nova");
    const keys = [
      `uploads/${nova.id}/not-a-uuid/app.zip`,
      `uploads/${nova.id}/${SOME_UUID}/../../uploads/2/app.zip`,
      `uploads/${nova.id}/${SOME_UUID}/.hidden.zip`,
      `uploads/${nova.id}/${SOME_UUID}/`,
      `uploads/${nova.id}/${SOME_UUID}/app.zip\n`,
      `uploads/0${nova.id}/${SOME_UUID}/app.zip`,
      `uploads/${nova.id}/${SOME_UUID.toUpperCase()}/app.zip`,
      `/uploads/${nova.id}/${SOME_UUID}/app.zip`,
      `gs://${BINARIES}/uploads/${nova.id}/${SOME_UUID}/app.zip`,
      "seed/spotlify-2.3.1.dmg",
    ];

    for (const binaryKey of keys) {
      const res = await call(app, "post", "/api/apps", {
        as: nova,
        body: { ...APP_FIELDS, binaryKey },
      });
      expect(res.status, binaryKey).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.binaryKey).toEqual([
        "Must be a key from POST /api/apps/uploads",
      ]);
    }
  });

  it("returns 400 for a key whose upload never arrived or is in the other bucket", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const issued = await call(app, "post", "/api/apps/uploads", {
      as: nova,
      body: { kind: "binary", filename: "a.zip", contentType: "", size: 10 },
    });
    const binaryKey = await upload(app, storage, nova, "binary");

    const neverUploaded = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, binaryKey: issued.body.key },
    });
    // A binaries-bucket object passed as the icon: it isn't in the icons bucket.
    const wrongBucket = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, binaryKey, iconKey: binaryKey },
    });

    expect(neverUploaded.status).toBe(400);
    expect(neverUploaded.body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "An uploaded file was not found.",
        details: { binaryKey: ["Upload not found. Upload the file again."] },
      },
    });
    expect(wrongBucket.status).toBe(400);
    expect(wrongBucket.body.error.details).toEqual({
      iconKey: ["Upload not found. Upload the file again."],
    });
    expect((await rowCounts()).apps).toBe(0);
  });

  it("returns 409 for a key another app already uses", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const first = await publish(app, storage, nova);
    const freshBinary = await upload(app, storage, nova, "binary");

    const sameBinary = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, binaryKey: first.binaryKey },
    });
    const sameIcon = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, binaryKey: freshBinary, iconKey: first.iconKey },
    });

    expect(sameBinary.status).toBe(409);
    expect(sameBinary.body).toEqual({
      error: {
        code: "CONFLICT",
        message: "That upload is already used by another app.",
        details: { binaryKey: ["Already used by another app."] },
      },
    });
    expect(sameIcon.status).toBe(409);
    expect(sameIcon.body.error.details).toEqual({ iconKey: ["Already used by another app."] });
    expect((await rowCounts()).apps).toBe(1);
  });

  it("lets only one of two concurrent creates with the same key through", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const binaryKey = await upload(app, storage, nova, "binary");
    // Open spare connections first, so the two transactions really overlap.
    await Promise.all(Array.from({ length: 4 }, () => db.query("SELECT pg_sleep(0.02)")));

    const results = await Promise.all(
      [1, 2].map(() =>
        call(app, "post", "/api/apps", { as: nova, body: { ...APP_FIELDS, binaryKey } }),
      ),
    );

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect((await rowCounts()).apps).toBe(1);
  });

  it("returns 400 with field details for invalid metadata", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const binaryKey = await upload(app, storage, nova, "binary");
    const cases: [object, string][] = [
      [{ title: "   " }, "title"],
      [{ title: "t".repeat(101) }, "title"],
      [{ tagline: "t".repeat(256) }, "tagline"],
      [{ description: "" }, "description"],
      [{ description: "d".repeat(5001) }, "description"],
      [{ category: "Music" }, "category"],
      [{ category: "productivity" }, "category"],
      [{ version: "v1.0" }, "version"],
      [{ version: "1" }, "version"],
      [{ version: "1.2.3.4" }, "version"],
      [{ version: "1.0.0-" }, "version"],
      [{ version: "1.0.0-beta.1234567890" }, "version"], // 21 characters
      [{ binaryKey: undefined }, "binaryKey"],
      [{ iconKey: null }, "iconKey"],
      // NUL can't be stored (it would be a 500); one-line fields also bar controls and bidi.
      [{ title: "Focus\u0000Timer" }, "title"],
      [{ title: "Focus\tTimer" }, "title"],
      [{ tagline: "Safe \u202Eexe.gpj" }, "tagline"],
      [{ description: "A timer\u0000" }, "description"],
    ];

    for (const [fields, field] of cases) {
      const res = await call(app, "post", "/api/apps", {
        as: nova,
        body: { ...APP_FIELDS, binaryKey, ...fields },
      });
      expect(res.status, JSON.stringify(fields)).toBe(400);
      expect(res.body.error.details[field], JSON.stringify(fields)).toBeDefined();
    }
    expect((await rowCounts()).apps).toBe(0);
  });

  it("accepts values at the limits", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");

    for (const fields of [
      { title: "t".repeat(100), tagline: "t".repeat(255), description: "d".repeat(5000) },
      { version: "1.0.0-beta.123456789", category: "Music & Audio" }, // 20 characters
      { version: "2.1" },
      { description: "Line one.\n\n\tLine two.", title: "Photo Editor — Ünïcode ok" },
    ]) {
      const binaryKey = await upload(app, storage, nova, "binary");
      const res = await call(app, "post", "/api/apps", {
        as: nova,
        body: { ...APP_FIELDS, binaryKey, ...fields },
      });
      expect(res.status, JSON.stringify(fields)).toBe(201);
    }
  });
});

describe("PATCH /api/apps/:id", () => {
  it("updates only the given fields, sets updated_at and deletes nothing", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id } = await publish(app, storage, nova);
    await db.query("UPDATE apps SET updated_at = NOW() - INTERVAL '1 day', download_count = 7");
    const before = await storedRow(id);

    const res = await call(app, "patch", `/api/apps/${id}`, {
      as: nova,
      body: { title: "Focus Timer Pro", version: "2.0.0" },
    });

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(Object.keys(res.body).sort()).toEqual(PUBLIC_APP_KEYS);
    expect(res.body).toMatchObject({
      ...APP_FIELDS,
      title: "Focus Timer Pro",
      version: "2.0.0",
      download_count: 7,
    });
    const after = await storedRow(id);
    expect(after).toEqual({
      ...before,
      title: "Focus Timer Pro",
      version: "2.0.0",
      updated_at: after?.updated_at,
    });
    expect((after?.updated_at as Date).getTime()).toBeGreaterThan(
      (before?.updated_at as Date).getTime(),
    );
    expect(storage.deleted).toEqual([]);
  });

  it("deletes the replaced binary after the update and keeps the new one", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id, binaryKey: oldKey } = await publish(app, storage, nova);
    const newKey = await upload(app, storage, nova, "binary", "focus-timer-2.zip");

    const res = await call(app, "patch", `/api/apps/${id}`, {
      as: nova,
      body: { binaryKey: newKey, version: "2.0.0" },
    });

    expect(res.status).toBe(200);
    expect((await storedRow(id))?.file_url).toBe(`gs://${BINARIES}/${newKey}`);
    expect(storage.deleted).toEqual([{ bucket: BINARIES, key: oldKey }]);
    expect(storage.has(BINARIES, newKey)).toBe(true);
    expect(storage.has(BINARIES, oldKey)).toBe(false);
  });

  it("deletes a replaced icon, and deletes nothing when an app without one gains one", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id, iconKey: oldIcon } = await publish(app, storage, nova);
    const plainBinary = await upload(app, storage, nova, "binary");
    const plain = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, binaryKey: plainBinary },
    });
    const [newIcon, firstIcon] = [
      await upload(app, storage, nova, "icon"),
      await upload(app, storage, nova, "icon"),
    ];

    const replaced = await call(app, "patch", `/api/apps/${id}`, {
      as: nova,
      body: { iconKey: newIcon },
    });
    const gained = await call(app, "patch", `/api/apps/${plain.body.id}`, {
      as: nova,
      body: { iconKey: firstIcon },
    });

    expect(replaced.status).toBe(200);
    expect(replaced.body.icon_url).toBe(`https://storage.googleapis.com/${ICONS}/${newIcon}`);
    expect(gained.status).toBe(200);
    expect(gained.body.icon_url).toBe(`https://storage.googleapis.com/${ICONS}/${firstIcon}`);
    expect(storage.deleted).toEqual([{ bucket: ICONS, key: oldIcon }]);
  });

  it("deletes nothing, and finds no conflict, when the current keys are sent again", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id, binaryKey, iconKey } = await publish(app, storage, nova);

    const res = await call(app, "patch", `/api/apps/${id}`, {
      as: nova,
      body: { binaryKey, iconKey },
    });

    expect(res.status).toBe(200);
    expect(storage.deleted).toEqual([]);
    expect(storage.has(BINARIES, binaryKey) && storage.has(ICONS, iconKey)).toBe(true);
  });

  it("returns 404 for another developer's app, changes nothing and deletes nothing", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const orbit = await createUser("orbit");
    const { id, binaryKey, iconKey } = await publish(app, storage, nova);
    const orbitKey = await upload(app, storage, orbit, "binary");
    const before = await storedRow(id);

    const metadata = await call(app, "patch", `/api/apps/${id}`, {
      as: orbit,
      body: { title: "Hijacked" },
    });
    const withKey = await call(app, "patch", `/api/apps/${id}`, {
      as: orbit,
      body: { binaryKey: orbitKey },
    });
    const unknown = await call(app, "patch", "/api/apps/999", {
      as: orbit,
      body: { title: "Hijacked" },
    });

    for (const res of [metadata, withKey, unknown]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
    expect(await storedRow(id)).toEqual(before);
    expect(storage.deleted).toEqual([]);
    expect(storage.has(BINARIES, binaryKey) && storage.has(ICONS, iconKey)).toBe(true);
  });

  it("checks new keys like create: 403 for another prefix, 400 if missing, 409 if in use", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const orbit = await createUser("orbit");
    const { id } = await publish(app, storage, nova);
    const other = await publish(app, storage, nova);
    const orbitKey = await upload(app, storage, orbit, "binary");
    const issued = await call(app, "post", "/api/apps/uploads", {
      as: nova,
      body: { kind: "icon", filename: "i.png", contentType: "image/png", size: 10 },
    });

    const patch = (body: object) => call(app, "patch", `/api/apps/${id}`, { as: nova, body });
    const foreign = await patch({ binaryKey: orbitKey });
    const missing = await patch({ iconKey: issued.body.key });
    const inUse = await patch({ binaryKey: other.binaryKey });
    const malformed = await patch({ binaryKey: "seed/app.zip" });

    expect(foreign.status).toBe(403);
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual({
      iconKey: ["Upload not found. Upload the file again."],
    });
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.details).toEqual({ binaryKey: ["Already used by another app."] });
    expect(malformed.status).toBe(400);
    expect(storage.deleted).toEqual([]);
  });

  it("returns 400 for an empty body, a null icon, or an invalid id", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id } = await publish(app, storage, nova);

    const empty = await call(app, "patch", `/api/apps/${id}`, { as: nova, body: {} });
    const unknownField = await call(app, "patch", `/api/apps/${id}`, {
      as: nova,
      body: { download_count: 1_000_000 },
    });
    const nullIcon = await call(app, "patch", `/api/apps/${id}`, {
      as: nova,
      body: { iconKey: null },
    });

    for (const res of [empty, unknownField]) {
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { code: "VALIDATION_ERROR", message: "Change at least one field.", details: {} },
      });
    }
    expect(nullIcon.status).toBe(400);
    expect(nullIcon.body.error.details.iconKey).toBeDefined();
    for (const badId of ["abc", "0", "-1", "1.5", "2147483648"]) {
      const res = await call(app, "patch", `/api/apps/${badId}`, {
        as: nova,
        body: { title: "x" },
      });
      expect(res.status, badId).toBe(400);
      expect(res.body.error.details.id, badId).toBeDefined();
    }
    expect((await storedRow(id))?.download_count).toBe(0);
  });

  it("only deletes objects in this deployment's buckets", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    // Like a row seeded against another bucket, with an icon hosted elsewhere.
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO apps (developer_id, title, tagline, description, category, version, file_url, icon_url)
       VALUES ($1, 'Old', 'Old', 'Old', 'Other', '1.0', 'gs://another-bucket/seed/old.zip',
               'https://cdn.example/icon.png')
       RETURNING id`,
      [nova.id],
    );
    const binaryKey = await upload(app, storage, nova, "binary");
    const iconKey = await upload(app, storage, nova, "icon");

    const res = await call(app, "patch", `/api/apps/${rows[0]?.id}`, {
      as: nova,
      body: { binaryKey, iconKey },
    });

    expect(res.status).toBe(200);
    expect(storage.deleted).toEqual([]);
  });

  it("still succeeds when deleting the old objects fails, and logs no key or gs:// URL", async () => {
    const { app, storage } = setup(fakeStorage({ failDeletes: true }));
    const nova = await createUser("nova");
    const { id, binaryKey, iconKey } = await publish(app, storage, nova);
    const newBinary = await upload(app, storage, nova, "binary");
    const newIcon = await upload(app, storage, nova, "icon");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await call(app, "patch", `/api/apps/${id}`, {
      as: nova,
      body: { binaryKey: newBinary, iconKey: newIcon },
    });

    expect(res.status).toBe(200);
    expect(res.body.icon_url).toBe(`https://storage.googleapis.com/${ICONS}/${newIcon}`);
    // Each object is tried on its own: the first failure doesn't skip the second.
    expect(storage.deleted).toEqual(
      expect.arrayContaining([
        { bucket: BINARIES, key: binaryKey },
        { bucket: ICONS, key: iconKey },
      ]),
    );
    expect(logged).toHaveBeenCalledTimes(2);
    const output = logOutput(logged);
    expect(output).toContain(`Could not delete the old binary of app ${id}: Error (code 503)`);
    expect(output).toContain(`Could not delete the old icon of app ${id}: Error (code 503)`);
    for (const secret of [binaryKey, iconKey, "gs://", "uploads/", BINARIES, ICONS]) {
      expect(output).not.toContain(secret);
    }
  });
});

describe("DELETE /api/apps/:id", () => {
  it("deletes the app, its reviews and both stored objects", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const alex = await createUser("alex", "user");
    const { id, binaryKey, iconKey } = await publish(app, storage, nova);
    const kept = await publish(app, storage, nova);
    await addReview(id, alex.id, 5);
    await addReview(kept.id, alex.id, 4);

    const res = await call(app, "delete", `/api/apps/${id}`, { as: nova });

    expect(res.status).toBe(204);
    expect(res.text).toBe("");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(await storedRow(id)).toBeUndefined();
    expect(await rowCounts()).toMatchObject({ apps: 1, reviews: 1 });
    expect(storage.deleted).toEqual(
      expect.arrayContaining([
        { bucket: BINARIES, key: binaryKey },
        { bucket: ICONS, key: iconKey },
      ]),
    );
    expect(storage.deleted).toHaveLength(2);
    expect(storage.has(BINARIES, kept.binaryKey)).toBe(true);
  });

  it("returns 404 for another developer's app and keeps the row, its reviews and objects", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const orbit = await createUser("orbit");
    const alex = await createUser("alex", "user");
    const { id } = await publish(app, storage, nova);
    await addReview(id, alex.id, 5);
    const before = await storedRow(id);

    const res = await call(app, "delete", `/api/apps/${id}`, { as: orbit });
    const unknown = await call(app, "delete", "/api/apps/999", { as: orbit });

    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect(unknown.body).toEqual(NOT_FOUND);
    expect(await storedRow(id)).toEqual(before);
    expect((await rowCounts()).reviews).toBe(1);
    expect(storage.deleted).toEqual([]);
  });

  it("still returns 204 when deleting the objects fails, and logs no key or gs:// URL", async () => {
    const { app, storage } = setup(fakeStorage({ failDeletes: true }));
    const nova = await createUser("nova");
    const { id, binaryKey, iconKey } = await publish(app, storage, nova);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await call(app, "delete", `/api/apps/${id}`, { as: nova });

    expect(res.status).toBe(204);
    expect(await storedRow(id)).toBeUndefined();
    expect(storage.deleted).toHaveLength(2);
    const output = logOutput(logged);
    expect(output).toContain(`app ${id}`);
    for (const secret of [binaryKey, iconKey, "gs://", "uploads/", BINARIES, ICONS]) {
      expect(output).not.toContain(secret);
    }
  });

  it("returns 400 for an id above 2^31 - 1", async () => {
    const { app } = setup();
    const nova = await createUser("nova");

    const res = await call(app, "delete", "/api/apps/2147483648", { as: nova });

    expect(res.status).toBe(400);
    expect(res.body.error.details.id).toBeDefined();
  });
});

describe("GET /api/developer/apps", () => {
  it("lists only the caller's apps, newest update first, with numeric review aggregates", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const orbit = await createUser("orbit");
    const [alex, sam] = [await createUser("alex", "user"), await createUser("sam", "user")];
    const reviewed = await publish(app, storage, nova, { title: "Reviewed" });
    const quiet = await publish(app, storage, nova, { title: "Quiet" });
    const foreign = await publish(app, storage, orbit, { title: "Foreign" });
    await addReview(reviewed.id, alex.id, 4);
    await addReview(reviewed.id, sam.id, 5);
    await addReview(foreign.id, alex.id, 1);
    await db.query("UPDATE apps SET updated_at = NOW() - INTERVAL '1 hour' WHERE id = $1", [
      quiet.id,
    ]);

    const res = await call(app, "get", "/api/developer/apps", { as: nova });

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.map((a: { title: string }) => a.title)).toEqual(["Reviewed", "Quiet"]);
    expect(Object.keys(res.body[0]).sort()).toEqual(
      [...PUBLIC_APP_KEYS, "avg_rating", "review_count"].sort(),
    );
    expect(res.body[0]).toMatchObject({ developer_id: nova.id, avg_rating: 4.5, review_count: 2 });
    expect(res.body[1]).toMatchObject({ avg_rating: null, review_count: 0 });
  });

  it("returns an empty array for a developer with no apps", async () => {
    const { app } = setup();
    const nova = await createUser("nova");

    const res = await call(app, "get", "/api/developer/apps", { as: nova });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/apps/:id/download", () => {
  it("counts the download and redirects to the storage service's signed URL", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const binaryKey = await upload(app, storage, nova, "binary", "PhotoEditor.EXE");
    const created = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, title: 'Photo "Editor" & More', version: "4.0.2", binaryKey },
    });

    const res = await call(app, "get", `/api/apps/${created.body.id}/download`);

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe(
      `https://download.fake-gcs.test/${binaryKey}?filename=Photo-Editor-More-4.0.2.exe`,
    );
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(await downloadCount(created.body.id)).toBe(1);
  });

  it("names the download after the title and version with the key's extension", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const binaryKey = await upload(app, storage, nova, "binary", "json-lens.AppImage");
    const created = await call(app, "post", "/api/apps", {
      as: nova,
      body: { ...APP_FIELDS, title: "JSON Lens", version: "1.8.2", binaryKey },
    });

    const res = await call(app, "get", `/api/apps/${created.body.id}/download`);

    expect(new URL(res.headers["location"] ?? "").searchParams.get("filename")).toBe(
      "JSON-Lens-1.8.2.AppImage",
    );
  });

  it("answers HEAD with 405 and doesn't count it", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id } = await publish(app, storage, nova);

    const res = checked(await request(app).head(`/api/apps/${id}/download`));

    expect(res.status).toBe(405);
    expect(res.headers["allow"]).toBe("GET");
    expect(await downloadCount(id)).toBe(0);
  });

  it("refuses, uncounted, a cross-site page embedding the URL, but counts a followed link", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id } = await publish(app, storage, nova);
    const download = (headers: Record<string, string>) =>
      request(app).get(`/api/apps/${id}/download`).set(headers).then(checked);

    const embedded = [
      { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "image" },
      { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "empty" },
      { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "iframe" },
    ];
    for (const headers of embedded) {
      const res = await download(headers);
      expect(res.status, JSON.stringify(headers)).toBe(403);
      expect(res.body).toEqual({
        error: { code: "FORBIDDEN", message: "Open the download link directly." },
      });
    }
    expect(await downloadCount(id)).toBe(0);

    const opened: Record<string, string>[] = [
      {
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
      },
      { "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" },
      { "Sec-Fetch-Site": "none", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" },
      {},
    ];
    for (const headers of opened) {
      expect((await download(headers)).status, JSON.stringify(headers)).toBe(302);
    }
    expect(await downloadCount(id)).toBe(opened.length);
  });

  it("adds exactly 10 for 10 parallel downloads (INV-3)", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id } = await publish(app, storage, nova);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => call(app, "get", `/api/apps/${id}/download`)),
    );

    expect(results.map((res) => res.status)).toEqual(Array(10).fill(302));
    expect(await downloadCount(id)).toBe(10);
  });

  it("returns 404 for an unknown app and 400 for a malformed or out-of-range id", async () => {
    const { app } = setup();

    const unknown = await call(app, "get", "/api/apps/999/download");

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(NOT_FOUND);
    for (const badId of ["2147483648", "99999999999", "abc", "0", "1.5"]) {
      const res = await call(app, "get", `/api/apps/${badId}/download`);
      expect(res.status, badId).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it(`returns 429 after ${DOWNLOADS_PER_MINUTE} a minute from one IP for one app, without counting it`, async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const first = await publish(app, storage, nova);
    const second = await publish(app, storage, nova);
    const download = (id: number, ip: string) =>
      call(app, "get", `/api/apps/${id}/download`, { ip });

    for (let i = 1; i <= DOWNLOADS_PER_MINUTE; i++) {
      expect((await download(first.id, "203.0.113.1")).status).toBe(302);
    }
    const limited = await download(first.id, "203.0.113.1");
    const otherApp = await download(second.id, "203.0.113.1");
    const otherIp = await download(first.id, "203.0.113.2");

    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many downloads. Try again in a minute." },
    });
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(otherApp.status).toBe(302);
    expect(otherIp.status).toBe(302);
    expect(await downloadCount(first.id)).toBe(DOWNLOADS_PER_MINUTE + 1);
  });

  it("answers 500 when signing fails, and logs the app id but not the key", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const { id, binaryKey } = await publish(app, storage, nova);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(storage, "createDownloadUrl").mockRejectedValue(
      Object.assign(new Error(`No access to gs://${BINARIES}/${binaryKey}`), { code: 403 }),
    );

    const res = await call(app, "get", `/api/apps/${id}/download`);

    expect(res.status).toBe(500);
    const output = logOutput(logged);
    expect(output).toContain(`GET /api/apps/${id}/download failed`);
    expect(output).toContain("Storage download URL failed: Error (code 403)");
    expect(output).not.toContain(binaryKey);
    expect(output).not.toContain(BINARIES);
  });
});

describe("deleting a developer", () => {
  it("removes their apps and those apps' reviews, and nothing else", async () => {
    const { app, storage } = setup();
    const nova = await createUser("nova");
    const orbit = await createUser("orbit");
    const alex = await createUser("alex", "user");
    const novaApps = [await publish(app, storage, nova), await publish(app, storage, nova)];
    const orbitApp = await publish(app, storage, orbit);
    for (const { id } of novaApps) await addReview(id, alex.id, 5);
    await addReview(orbitApp.id, alex.id, 3);
    await addReview(orbitApp.id, nova.id, 4);
    expect(await rowCounts()).toEqual({ users: 3, password_resets: 0, apps: 3, reviews: 4 });

    await db.query("DELETE FROM users WHERE id = $1", [nova.id]);

    // Nova's two apps and their reviews go, and so does nova's review of orbit's app.
    expect(await rowCounts()).toEqual({ users: 2, password_resets: 0, apps: 1, reviews: 1 });
    expect(await storedRow(orbitApp.id)).toBeDefined();
  });
});
