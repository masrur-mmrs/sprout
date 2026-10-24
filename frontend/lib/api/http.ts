import { ERROR_CODES, type ErrorBody, type ErrorCode, type ErrorDetails } from "./types";

/** A backend path. Both fetchers take only these, so a caller can't aim one at another origin. */
export type ApiPath = `/api/${string}`;

const GENERIC_MESSAGE = "Something went wrong. Please try again.";
const KNOWN_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

/**
 * The only error the API layer throws. A failure without an envelope (network down, the proxy's
 * HTML 502, a body that isn't JSON) becomes `INTERNAL` with a generic message, and `status` is 0
 * when no response arrived at all.
 */
export class ApiError extends Error {
  override name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

function isErrorBody(body: unknown): body is ErrorBody {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const { error } = body;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    KNOWN_CODES.has(error.code) &&
    "message" in error &&
    typeof error.message === "string"
  );
}

/** Sends the request and returns the parsed JSON (`undefined` for a 204), or throws ApiError. */
export async function apiRequest<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    // The caller cancelled it: not a failure, so let their AbortError through untouched.
    if (init.signal?.aborted) throw err;
    throw new ApiError(0, "INTERNAL", GENERIC_MESSAGE, undefined, { cause: err });
  }
  if (res.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    if (init.signal?.aborted) throw err;
    throw new ApiError(res.status, "INTERNAL", GENERIC_MESSAGE, undefined, { cause: err });
  }
  if (res.ok) return body as T;
  if (isErrorBody(body)) {
    const { code, message, details } = body.error;
    throw new ApiError(res.status, code, message, details);
  }
  throw new ApiError(res.status, "INTERNAL", GENERIC_MESSAGE);
}
