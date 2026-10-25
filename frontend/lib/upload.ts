import { apiFetch } from "./api/client";
import type { UploadKind, UploadRequestBody, UploadUrlResponse } from "./api/types";

/** The PUT to storage failed: `status` is 0 when no response arrived, `aborted` when cancelled. */
export class UploadError extends Error {
  override name = "UploadError";

  constructor(
    readonly status: number,
    readonly aborted: boolean,
  ) {
    // Never the URL: it's a bearer credential until it expires.
    super(aborted ? "Upload cancelled." : "Upload failed.");
  }
}

export interface UploadOptions {
  /** 0–1, as the bytes go out. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Uploads `file` straight to storage (G2) and resolves with its key, for `binaryKey` or `iconKey`.
 * Each call asks for a new signed URL, since they expire, so a retry is just another call. The URL
 * lives only inside this call: it's never logged, rendered or stored. The key is used verbatim.
 * `/uploads` failures throw ApiError; the PUT's throw UploadError. An abort before the PUT throws
 * the AbortError apiFetch passes through.
 */
export async function uploadFile(
  kind: UploadKind,
  file: File,
  { onProgress, signal }: UploadOptions = {},
): Promise<string> {
  const body: UploadRequestBody = {
    kind,
    filename: file.name,
    // Browsers report "" for .AppImage, .deb and .pkg; the backend signs binaries as octet-stream.
    contentType: file.type || "application/octet-stream",
    size: file.size,
  };
  const { uploadUrl, key, headers } = await apiFetch<UploadUrlResponse>("/api/apps/uploads", {
    method: "POST",
    body,
    signal,
  });
  await put(uploadUrl, headers, file, onProgress, signal);
  return key;
}

/**
 * XHR rather than fetch, because only XHR reports upload progress. It sends exactly the signed
 * headers (any other would fail the signature) and no credentials: storage is another origin.
 */
function put(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: UploadOptions["onProgress"],
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadError(0, true));
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const settle = (done: () => void) => {
      signal?.removeEventListener("abort", abort);
      done();
    };

    xhr.open("PUT", url);
    xhr.withCredentials = false;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve();
        } else {
          reject(new UploadError(xhr.status, false));
        }
      });
    xhr.onerror = () => settle(() => reject(new UploadError(0, false)));
    xhr.onabort = () => settle(() => reject(new UploadError(0, true)));

    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(file);
  });
}
