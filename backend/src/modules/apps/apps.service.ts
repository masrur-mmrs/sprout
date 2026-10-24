import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { env } from "../../config/env.js";
import { withTransaction } from "../../db/pool.js";
import { HttpError, type ErrorDetails } from "../../lib/errors.js";
import type { StorageService, UploadUrl } from "../../services/storage/storage.js";
import {
  countDownload,
  deleteOwnedApp,
  findUrlConflicts,
  insertApp,
  lockDeveloperUploads,
  lockOwnedApp,
  updateOwnedApp,
  type PublicApp,
} from "./apps.queries.js";
import {
  BINARY_CONTENT_TYPE,
  BINARY_EXTENSIONS,
  MAX_BINARY_BYTES,
  MAX_ICON_BYTES,
  safeFilename,
  uploadKeyOwner,
  type CreateAppInput,
  type UpdateAppInput,
  type UploadRequest,
} from "./apps.schemas.js";

/** `apps.file_url` is this followed by the object key. */
const FILE_URL_PREFIX = `gs://${env.GCS_BINARY_BUCKET}/`;

type KeyField = "binaryKey" | "iconKey";
const KEY_BUCKETS: Record<KeyField, string> = {
  binaryKey: env.GCS_BINARY_BUCKET,
  iconKey: env.GCS_ICON_BUCKET,
};

interface StoredObject {
  label: "binary" | "icon";
  bucket: string;
  key: string;
}

function appNotFound(): HttpError {
  return new HttpError(404, "NOT_FOUND", "App not found.");
}

/** `err.name` and `err.code` only, never `err.message`: GCS messages quote bucket and object names. */
function describeStorageError(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const code: unknown = (err as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? `${err.name} (code ${code})`
    : err.name;
}

/**
 * Runs a storage call the request can't succeed without. A failure becomes a plain Error (a 500)
 * whose stack, which the error handler logs, names only the operation and the error code.
 */
async function fromStorage<T>(operation: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    throw new Error(`Storage ${operation} failed: ${describeStorageError(err)}`);
  }
}

/** Signs a PUT for a fresh key under the caller's prefix. The cap is the kind's, not `size`. */
export async function issueUploadUrl(
  storage: StorageService,
  userId: number,
  input: UploadRequest,
): Promise<UploadUrl & { key: string }> {
  const binary = input.kind === "binary";
  const key = `uploads/${userId}/${randomUUID()}/${input.filename}`;
  const { uploadUrl, headers } = await fromStorage("upload URL", () =>
    storage.createUploadUrl({
      bucket: binary ? env.GCS_BINARY_BUCKET : env.GCS_ICON_BUCKET,
      key,
      contentType: binary ? BINARY_CONTENT_TYPE : input.contentType,
      maxBytes: binary ? MAX_BINARY_BYTES : MAX_ICON_BYTES,
    }),
  );
  return { uploadUrl, key, headers };
}

/**
 * Client keys are untrusted. The schema already rejected any shape `issueUploadUrl` doesn't issue;
 * this then answers 403 for a key under another account's prefix, and 400 for one whose object
 * isn't in that key's bucket (the upload never happened, or went to the other bucket).
 */
async function verifyKeys(
  storage: StorageService,
  userId: number,
  keys: Partial<Record<KeyField, string>>,
): Promise<void> {
  const given = (["binaryKey", "iconKey"] as const).flatMap((field) => {
    const key = keys[field];
    return key === undefined ? [] : [{ field, key }];
  });
  if (given.some(({ key }) => uploadKeyOwner(key) !== userId)) {
    throw new HttpError(403, "FORBIDDEN", "That upload belongs to another account.");
  }

  const found = await Promise.all(
    given.map(({ field, key }) =>
      fromStorage("existence check", () => storage.objectExists(KEY_BUCKETS[field], key)),
    ),
  );
  const details: ErrorDetails = {};
  given.forEach(({ field }, i) => {
    if (!found[i]) details[field] = ["Upload not found. Upload the file again."];
  });
  if (Object.keys(details).length > 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "An uploaded file was not found.", details);
  }
}

/**
 * 409 if another app already stores one of these URLs: deleting that app would delete the object
 * from under this one. Run it inside the transaction, after lockDeveloperUploads.
 */
async function assertUrlsUnused(
  client: PoolClient,
  urls: { fileUrl: string | null; iconUrl: string | null },
  exceptAppId: number | null,
): Promise<void> {
  const { binary_taken, icon_taken } = await findUrlConflicts(client, urls, exceptAppId);
  const details: ErrorDetails = {};
  if (binary_taken) details.binaryKey = ["Already used by another app."];
  if (icon_taken) details.iconKey = ["Already used by another app."];
  if (Object.keys(details).length > 0) {
    throw new HttpError(409, "CONFLICT", "That upload is already used by another app.", details);
  }
}

/** The object a stored file_url points at, if it's in this deployment's binaries bucket. */
function binaryObject(fileUrl: string): StoredObject | null {
  const key = fileUrl.startsWith(FILE_URL_PREFIX) ? fileUrl.slice(FILE_URL_PREFIX.length) : "";
  return key === "" ? null : { label: "binary", bucket: env.GCS_BINARY_BUCKET, key };
}

/** The object a stored icon_url points at, if it's in the icons bucket. Seeded apps have none. */
function iconObject(storage: StorageService, iconUrl: string | null): StoredObject | null {
  const prefix = storage.publicUrl("");
  const key = iconUrl?.startsWith(prefix) ? iconUrl.slice(prefix.length) : "";
  return key === "" ? null : { label: "icon", bucket: env.GCS_ICON_BUCKET, key };
}

/**
 * Deletes objects whose row change is already committed. Best effort: each object is tried on its
 * own, and a failure only leaves an orphan, logged by app id and error code, never by key. Awaited
 * before responding, because Cloud Run throttles the CPU once the response is sent.
 */
async function deleteObjects(
  storage: StorageService,
  appId: number,
  objects: (StoredObject | null)[],
): Promise<void> {
  await Promise.all(
    objects.map(async (object) => {
      if (!object) return;
      try {
        await storage.deleteObject(object.bucket, object.key);
      } catch (err) {
        console.error(
          `Could not delete the old ${object.label} of app ${appId}: ${describeStorageError(err)}`,
        );
      }
    }),
  );
}

export async function publishApp(
  db: Pool,
  storage: StorageService,
  developerId: number,
  input: CreateAppInput,
): Promise<PublicApp> {
  await verifyKeys(storage, developerId, input);
  const fileUrl = FILE_URL_PREFIX + input.binaryKey;
  const iconUrl = input.iconKey === undefined ? null : storage.publicUrl(input.iconKey);

  return withTransaction(async (client) => {
    await lockDeveloperUploads(client, developerId);
    await assertUrlsUnused(client, { fileUrl, iconUrl }, null);
    return insertApp(client, {
      developerId,
      title: input.title,
      tagline: input.tagline,
      description: input.description,
      category: input.category,
      version: input.version,
      fileUrl,
      iconUrl,
    });
  }, db);
}

/**
 * Updates the owner's app; anyone else's is a 404, so its existence isn't revealed. A binary or
 * icon replaced by a different key is deleted after the commit. Sending the current key again
 * changes and deletes nothing.
 */
export async function updateApp(
  db: Pool,
  storage: StorageService,
  developerId: number,
  appId: number,
  input: UpdateAppInput,
): Promise<PublicApp> {
  await verifyKeys(storage, developerId, input);
  const fileUrl = input.binaryKey === undefined ? null : FILE_URL_PREFIX + input.binaryKey;
  const iconUrl = input.iconKey === undefined ? null : storage.publicUrl(input.iconKey);

  const { app, before } = await withTransaction(async (client) => {
    if (fileUrl !== null || iconUrl !== null) await lockDeveloperUploads(client, developerId);
    const before = await lockOwnedApp(client, appId, developerId);
    if (!before) throw appNotFound();
    await assertUrlsUnused(client, { fileUrl, iconUrl }, appId);
    const app = await updateOwnedApp(client, appId, developerId, {
      title: input.title,
      tagline: input.tagline,
      description: input.description,
      category: input.category,
      version: input.version,
      fileUrl,
      iconUrl,
    });
    if (!app) throw appNotFound();
    return { app, before };
  }, db);

  await deleteObjects(storage, appId, [
    fileUrl !== null && fileUrl !== before.file_url ? binaryObject(before.file_url) : null,
    iconUrl !== null && iconUrl !== before.icon_url ? iconObject(storage, before.icon_url) : null,
  ]);
  return app;
}

/** Deletes the owner's app, its reviews (cascade) and then its objects. Anyone else's is a 404. */
export async function deleteApp(
  db: Pool,
  storage: StorageService,
  developerId: number,
  appId: number,
): Promise<void> {
  const removed = await deleteOwnedApp(db, appId, developerId);
  if (!removed) throw appNotFound();
  await deleteObjects(storage, appId, [
    binaryObject(removed.file_url),
    iconObject(storage, removed.icon_url),
  ]);
}

/** `${title}-${version}` plus the key's binary extension, limited to `[A-Za-z0-9._-]`. */
export function downloadFilename(title: string, version: string, key: string): string {
  const lower = key.toLowerCase();
  const extension = BINARY_EXTENSIONS.find((ext) => lower.endsWith(ext.toLowerCase())) ?? "";
  return safeFilename(`${title}-${version}`) + extension;
}

/**
 * Counts the download, then signs a GET for the binary. The count commits before signing (no
 * transaction is held across the network call), so a signing failure still counts.
 */
export async function startDownload(
  db: Pool,
  storage: StorageService,
  appId: number,
): Promise<string> {
  const app = await countDownload(db, appId);
  if (!app) throw appNotFound();
  const binary = binaryObject(app.file_url);
  if (!binary) throw new Error(`App ${appId}'s file_url is not in the binaries bucket`);
  const filename = downloadFilename(app.title, app.version, binary.key);
  return fromStorage("download URL", () => storage.createDownloadUrl(binary.key, filename));
}
