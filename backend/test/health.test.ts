import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { useTestDb } from "./helpers/db.js";

const db = useTestDb();

describe("GET /healthz", () => {
  it("returns 200 { ok: true }", async () => {
    const res = await request(createApp({ db })).get("/healthz");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
