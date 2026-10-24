import { Storage } from "@google-cloud/storage";
import type { StorageService } from "./storage.js";

const UPLOAD_URL_TTL_MS = 15 * 60_000;
const DOWNLOAD_URL_TTL_MS = 5 * 60_000;

/**
 * The production StorageService: V4 signed URLs on two buckets (G5). Binaries are private and
 * served through a signed GET; icons are public-read, so their URL never expires.
 *
 * `new Storage()` uses Application Default Credentials and looks them up only on the first call,
 * so the server starts without them. Signing needs a service-account identity (see
 * `.env.example`). Like createResendSender, it takes its config as arguments instead of importing
 * `env`.
 */
export function createGcsStorage(config: {
  binaryBucket: string;
  iconBucket: string;
}): StorageService {
  const storage = new Storage();
  const file = (bucket: string, key: string) => storage.bucket(bucket).file(key);

  return {
    async createUploadUrl({ bucket, key, contentType, maxBytes }) {
      const lengthRange = `0,${maxBytes}`;
      // Both headers are signed, so GCS rejects a PUT with another type or a larger body.
      const [uploadUrl] = await file(bucket, key).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + UPLOAD_URL_TTL_MS,
        contentType,
        extensionHeaders: { "x-goog-content-length-range": lengthRange },
      });
      return {
        uploadUrl,
        headers: { "Content-Type": contentType, "x-goog-content-length-range": lengthRange },
      };
    },

    async objectExists(bucket, key) {
      const [exists] = await file(bucket, key).exists();
      return exists;
    },

    async createDownloadUrl(key, filename) {
      const [url] = await file(config.binaryBucket, key).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + DOWNLOAD_URL_TTL_MS,
        responseDisposition: `attachment; filename="${filename}"`,
      });
      return url;
    },

    async deleteObject(bucket, key) {
      await file(bucket, key).delete({ ignoreNotFound: true });
    },

    publicUrl(key) {
      return `https://storage.googleapis.com/${config.iconBucket}/${key}`;
    },
  };
}
