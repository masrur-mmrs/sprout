import type { ErrorRequestHandler, RequestHandler } from "express";
import { DatabaseError } from "pg";
import { z } from "zod";
import { HttpError, type ErrorBody, type ErrorCode, type ErrorDetails } from "../lib/errors.js";

// Unique constraints whose violation is a user-fixable conflict on one field (001_init.sql).
const UNIQUE_FIELDS: Record<string, string> = {
  users_email_key: "email",
  users_username_key: "username",
};

/** body-parser's errors: http-errors with `expose: true` and a `type` such as "entity.too.large". */
function isBodyParserError(err: unknown): err is Error & { status: number; type: string } {
  return (
    err instanceof Error &&
    "expose" in err &&
    err.expose === true &&
    "type" in err &&
    typeof err.type === "string" &&
    "status" in err &&
    typeof err.status === "number" &&
    err.status >= 400 &&
    err.status < 500
  );
}

function envelope(code: ErrorCode, message: string, details?: ErrorDetails): ErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

function toResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof HttpError) {
    return { status: err.status, body: envelope(err.code, err.message, err.details) };
  }
  if (err instanceof z.ZodError) {
    const { formErrors, fieldErrors } = z.flattenError(err);
    // A root-level problem (missing or non-object body) has no field to sit under: say it here.
    const message = formErrors[0] ?? "Request validation failed.";
    return {
      status: 400,
      body: envelope("VALIDATION_ERROR", message, fieldErrors as ErrorDetails),
    };
  }
  if (isBodyParserError(err)) {
    // Fixed messages: a JSON.parse message quotes part of the body back.
    const message =
      err.type === "entity.parse.failed"
        ? "Request body is not valid JSON."
        : err.type === "entity.too.large"
          ? "Request body is too large."
          : "Request body could not be read.";
    return { status: err.status, body: envelope("VALIDATION_ERROR", message) };
  }
  if (err instanceof DatabaseError && err.code === "23505") {
    // Never forward pg's `detail`: it echoes the conflicting value ("Key (email)=(…)").
    const field = err.constraint ? UNIQUE_FIELDS[err.constraint] : undefined;
    return {
      status: 409,
      body: field
        ? envelope("CONFLICT", `That ${field} is already in use.`, { [field]: ["Already in use."] })
        : envelope("CONFLICT", "That resource already exists."),
    };
  }
  return { status: 500, body: envelope("INTERNAL", "Something went wrong. Please try again.") };
}

/** Sends the 404 envelope for any route nothing else matched, instead of Express's HTML page. */
export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "NOT_FOUND", "Not found."));
};

/** Register last. Maps every error to `{ error: { code, message, details? } }`. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // Too late for an envelope: Express's default handler closes the connection.
  if (res.headersSent) return next(err);

  const { status, body } = toResponse(err);
  if (status >= 500) {
    // The stack only. Logging the error object would print pg's `detail`, which can quote a whole
    // row (password_hash included). Request bodies are never logged either.
    const trace = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(`${req.method} ${req.path} failed: ${trace}`);
  }
  res.status(status).json(body);
};
