import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGcsStorage } from "../src/services/storage/gcsStorage.js";

// The real client would call GCS and IAM. This one records what each file method was given.
const gcs = vi.hoisted(() => ({
  constructorArgs: [] as unknown[][],
  getSignedUrl: vi.fn(),
  exists: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: class {
    constructor(...args: unknown[]) {
      gcs.constructorArgs.push(args);
    }
    bucket(bucket: string) {
      return {
        file: (key: string) => ({
          getSignedUrl: (options: unknown) => gcs.getSignedUrl(bucket, key, options),
          exists: () => gcs.exists(bucket, key),
          delete: (options: unknown) => gcs.delete(bucket, key, options),
        }),
      };
    }
  },
}));

const NOW = new Date("2026-10-24T12:00:00.000Z");
const CONFIG = { binaryBucket: "bin-bucket", iconBucket: "icon-bucket" };
const KEY = "uploads/7/0b5c4c43-2d1e-4b8e-9f3a-5d6c7e8f9a0b/app.zip";

beforeEach(() => {
  gcs.constructorArgs.length = 0;
  gcs.getSignedUrl.mockReset().mockResolvedValue(["https://signed.example/url"]);
  gcs.exists.mockReset();
  gcs.delete.mockReset().mockResolvedValue([{}]);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createGcsStorage", () => {
  it("uses Application Default Credentials: no options, nothing called until used", () => {
    createGcsStorage(CONFIG);

    expect(gcs.constructorArgs).toEqual([[]]);
    expect(gcs.getSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a 15-minute V4 PUT with the content type and the size cap as signed headers", async () => {
    const storage = createGcsStorage(CONFIG);

    const result = await storage.createUploadUrl({
      bucket: "icon-bucket",
      key: KEY,
      contentType: "image/png",
      maxBytes: 1_048_576,
    });

    expect(gcs.getSignedUrl).toHaveBeenCalledExactlyOnceWith("icon-bucket", KEY, {
      version: "v4",
      action: "write",
      expires: NOW.getTime() + 15 * 60_000,
      contentType: "image/png",
      extensionHeaders: { "x-goog-content-length-range": "0,1048576" },
    });
    // Exactly what the browser must send: anything else breaks the signature.
    expect(result).toEqual({
      uploadUrl: "https://signed.example/url",
      headers: { "Content-Type": "image/png", "x-goog-content-length-range": "0,1048576" },
    });
  });

  it("signs a 5-minute V4 GET in the binaries bucket that saves as the filename", async () => {
    const storage = createGcsStorage(CONFIG);

    const url = await storage.createDownloadUrl(KEY, "Focus-Timer-1.6.0.zip");

    expect(url).toBe("https://signed.example/url");
    expect(gcs.getSignedUrl).toHaveBeenCalledExactlyOnceWith("bin-bucket", KEY, {
      version: "v4",
      action: "read",
      expires: NOW.getTime() + 5 * 60_000,
      responseDisposition: 'attachment; filename="Focus-Timer-1.6.0.zip"',
    });
  });

  it("checks existence in the bucket it is given", async () => {
    const storage = createGcsStorage(CONFIG);
    gcs.exists.mockResolvedValueOnce([true]).mockResolvedValueOnce([false]);

    expect(await storage.objectExists("bin-bucket", KEY)).toBe(true);
    expect(await storage.objectExists("icon-bucket", KEY)).toBe(false);
    expect(gcs.exists.mock.calls).toEqual([
      ["bin-bucket", KEY],
      ["icon-bucket", KEY],
    ]);
  });

  it("deletes with ignoreNotFound, so a missing object is not an error", async () => {
    const storage = createGcsStorage(CONFIG);

    await storage.deleteObject("icon-bucket", KEY);

    expect(gcs.delete).toHaveBeenCalledExactlyOnceWith("icon-bucket", KEY, {
      ignoreNotFound: true,
    });
  });

  it("builds public URLs in the icons bucket, so publicUrl('') is their prefix", () => {
    const storage = createGcsStorage(CONFIG);

    expect(storage.publicUrl(KEY)).toBe(`https://storage.googleapis.com/icon-bucket/${KEY}`);
    expect(storage.publicUrl("")).toBe("https://storage.googleapis.com/icon-bucket/");
  });

  it("passes signing failures through to the caller", async () => {
    const storage = createGcsStorage(CONFIG);
    gcs.getSignedUrl.mockRejectedValueOnce(new Error("Cannot sign data without `client_email`."));

    await expect(storage.createDownloadUrl(KEY, "a.zip")).rejects.toThrow("client_email");
  });
});
