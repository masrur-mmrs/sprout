/** What a signed upload URL allows: one PUT of `key` into `bucket`, with this type and size cap. */
export interface UploadUrlRequest {
  bucket: string;
  key: string;
  contentType: string;
  /** The cap the storage service enforces, not the size the client declared. */
  maxBytes: number;
}

export interface UploadUrl {
  uploadUrl: string;
  /** Exactly the headers the browser must send with its PUT. Every one of them is signed. */
  headers: Record<string, string>;
}

/**
 * Object storage for app binaries and icons (G2, G5). `createApp({ storage })` receives one: GCS in
 * `src/index.ts`, an in-memory fake in tests. A failed call rejects with an error whose message
 * may name the bucket and key, so callers log only its name and code.
 */
export interface StorageService {
  createUploadUrl(request: UploadUrlRequest): Promise<UploadUrl>;
  objectExists(bucket: string, key: string): Promise<boolean>;
  /**
   * A short-lived signed GET for an object in the binaries bucket that downloads as `filename`.
   * `filename` goes into a Content-Disposition header, so it must be header-safe.
   */
  createDownloadUrl(key: string, filename: string): Promise<string>;
  /** Idempotent: deleting a missing object succeeds. */
  deleteObject(bucket: string, key: string): Promise<void>;
  /**
   * The permanent URL of an object in the public icons bucket: a fixed prefix followed by the key
   * as is (keys are URL-safe), so `publicUrl("")` is the prefix.
   */
  publicUrl(key: string): string;
}
