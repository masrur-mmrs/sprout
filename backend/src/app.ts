import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import helmet from "helmet";
import type { Pool } from "pg";
import { env } from "./config/env.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { originCheck } from "./middleware/originCheck.js";
import {
  createAppsRouter,
  createCategoriesRouter,
  createDeveloperAppsRouter,
} from "./modules/apps/apps.routes.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import type { EmailSender } from "./services/email/emailSender.js";
import type { StorageService } from "./services/storage/storage.js";

/** Services injected into the app. Tests always pass fakes or the test database's pool. */
export type AppDeps = { db: Pool; email: EmailSender; storage: StorageService };

export function createApp({ db, email, storage }: AppDeps): Express {
  const app = express();

  // Before anything reads req.ip: the rate limiters key on it. Too few hops makes every client
  // share the proxy's IP (and its limit); too many lets a client spoof X-Forwarded-For.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/api", originCheck);
  app.use("/api/auth", createAuthRouter({ db, email }));
  app.use("/api/apps", createAppsRouter({ db, storage }));
  app.use("/api/developer/apps", createDeveloperAppsRouter({ db }));
  app.use("/api/categories", createCategoriesRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
