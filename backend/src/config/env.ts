import { z } from "zod";

const envSchema = z.object({
  // No default: a deploy that forgets NODE_ENV must fail, not run with dev cookie settings.
  NODE_ENV: z.enum(["development", "test", "production"]),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "must be a postgres:// or postgresql:// connection string"),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  // Origin of the Next.js frontend: builds reset links and is the only allowed Origin.
  APP_URL: z.url({ protocol: /^https?$/ }).transform((url) => new URL(url).origin),
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string(),
  GCS_BINARY_BUCKET: z.string(),
  GCS_ICON_BUCKET: z.string(),
  // Proxies in front of Express (Next rewrite locally; Vercel + Google front end in prod).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  override name = "EnvValidationError";
}

/**
 * Validates `source` against the schema. Empty strings count as unset. The error lists every
 * bad variable by name only, never by value, because most of them are secrets.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const provided = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = envSchema.safeParse(provided);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = issue.path.join(".");
    const reason = key in provided ? issue.message : "is required but not set";
    return `  - ${key}: ${reason}`;
  });
  throw new EnvValidationError(`Invalid environment configuration:\n${problems.join("\n")}`);
}

function loadEnv(): Env {
  try {
    return parseEnv(process.env);
  } catch (err) {
    if (!(err instanceof EnvValidationError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}

export const env = loadEnv();
