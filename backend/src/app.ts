import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";

/**
 * Services injected into the app. Later phases add `db`, `email` (EmailSender) and
 * `storage` (StorageService); tests always pass fakes.
 */
export type AppDeps = Record<string, never>;

export function createApp(_deps: AppDeps = {}): Express {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  return app;
}
