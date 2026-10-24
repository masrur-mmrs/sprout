import { env } from "../../src/config/env.js";
import type { StorageService, UploadUrlRequest } from "../../src/services/storage/storage.js";

export interface FakeStorage extends StorageService {
  /** Stands in for the browser's PUT to a signed upload URL. */
  put(bucket: string, key: string): void;
  has(bucket: string, key: string): boolean;
  /** Every createUploadUrl request, in order. */
  uploads: UploadUrlRequest[];
  /** Every deleteObject call, in order, including ones that then failed. */
  deleted: { bucket: string; key: string }[];
}

/**
 * Keeps objects in memory per bucket and returns deterministic URLs; nothing reaches GCS. With
 * `failDeletes`, each delete records and then rejects with an error that names the bucket and key,
 * as GCS errors do, so a test can check that neither is logged.
 */
export function fakeStorage({ failDeletes = false }: { failDeletes?: boolean } = {}): FakeStorage {
  const buckets = new Map<string, Set<string>>();
  const objects = (bucket: string): Set<string> => {
    const existing = buckets.get(bucket);
    if (existing) return existing;
    const created = new Set<string>();
    buckets.set(bucket, created);
    return created;
  };
  const uploads: UploadUrlRequest[] = [];
  const deleted: { bucket: string; key: string }[] = [];

  return {
    uploads,
    deleted,
    put(bucket, key) {
      objects(bucket).add(key);
    },
    has(bucket, key) {
      return objects(bucket).has(key);
    },
    async createUploadUrl(request) {
      uploads.push(request);
      return {
        uploadUrl: `https://upload.fake-gcs.test/${request.bucket}/${request.key}`,
        headers: {
          "Content-Type": request.contentType,
          "x-goog-content-length-range": `0,${request.maxBytes}`,
        },
      };
    },
    async objectExists(bucket, key) {
      return objects(bucket).has(key);
    },
    async createDownloadUrl(key, filename) {
      return `https://download.fake-gcs.test/${key}?filename=${encodeURIComponent(filename)}`;
    },
    async deleteObject(bucket, key) {
      deleted.push({ bucket, key });
      if (failDeletes) {
        throw Object.assign(new Error(`Could not delete gs://${bucket}/${key}`), { code: 503 });
      }
      objects(bucket).delete(key);
    },
    publicUrl(key) {
      return `https://storage.googleapis.com/${env.GCS_ICON_BUCKET}/${key}`;
    },
  };
}
