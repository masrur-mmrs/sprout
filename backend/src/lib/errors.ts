/** Every `error.code` the API sends (Cross-Phase Architecture Summary). The frontend switches on these. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INVALID_OR_EXPIRED_TOKEN"
  | "INTERNAL";

/** Field name → messages, e.g. `{ email: ["Invalid email address"] }`. */
export type ErrorDetails = Record<string, string[]>;

/** The one error shape every non-2xx response uses. Changing it breaks every frontend page. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: ErrorDetails };
}

/**
 * An expected failure with a client-safe message. Throw it from a handler or middleware (Express 5
 * forwards async rejections) and the error handler turns it into the envelope.
 */
export class HttpError extends Error {
  override name = "HttpError";

  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message);
  }
}
