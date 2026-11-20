# Sprout

Sprout is an indie app store. Independent developers publish their apps, and people browse, search, download and review them. It is the CSE3103 course project.

## Features

- **Accounts:** sign up, sign in and sign out, with two roles: `developer` and `user`.
- **Password reset:** a 15-minute, single-use link sent by email.
- **Publishing:** developers create, edit and delete apps. Binaries and icons upload straight to Google Cloud Storage through signed URLs.
- **Browsing:** by category, sorted by popularity, newest or top rating.
- **Search:** typo-tolerant, using PostgreSQL trigram matching.
- **Reviews:** one per user per app, 1 to 5 stars with an optional comment.
- **Downloads:** counted, and served through short-lived signed links.

## Stack

| Part | Technology |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS. Deployed on Vercel. |
| Backend | Express 5, TypeScript, zod, jose, bcrypt. Deployed on Google Cloud Run. |
| Database | PostgreSQL 16 with `pg_trgm`. Raw SQL through `pg`, with no ORM. |
| Storage | Google Cloud Storage: a private bucket for binaries and a public bucket for icons. |
| Email | Resend, with React Email templates. |

## Repository layout

```
backend/        Express API, migrations, seed data, tests
frontend/       Next.js app
docker/         Postgres init script (creates the test database)
docs/           Architecture, database and implementation notes
docker-compose.yml   Local PostgreSQL 16
```

## Getting started

You need Node.js 22.12 or newer, npm, and Docker.

1. **Start PostgreSQL.** From the repository root:

   ```bash
   docker compose up -d
   ```

   This starts PostgreSQL on port 5432, with `sprout_dev` as the default database. Set `POSTGRES_PORT` if that port is taken.

2. **Set up the backend.**

   ```bash
   cd backend
   npm install
   cp .env.example .env
   ```

   Edit `backend/.env`. `JWT_SECRET` must be at least 32 characters, for example the output of `openssl rand -base64 48`. The other values can stay as they are for local work, except that uploads need a service-account identity. See the comments in `.env.example`.

   ```bash
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

   The API listens on `http://localhost:8080`. Check it with `curl http://localhost:8080/healthz`.

3. **Set up the frontend.** In a second terminal:

   ```bash
   cd frontend
   npm install
   cp .env.example .env.local
   npm run dev
   ```

   The app runs on `http://localhost:3000`. `BACKEND_URL` in `.env.local` tells Next.js where the API is. The browser only ever talks to port 3000, and Next.js forwards `/api/*` to the backend.

The seed creates two developer accounts and three user accounts, with sample apps and reviews. Their password is defined in `backend/src/db/seed.ts`. The seed refuses to run when `NODE_ENV=production`, and it only populates an empty database.

The init script that creates `sprout_test` only runs when the Postgres volume is first created. If the volume already existed, `sprout_test` may be missing. Create it with:

```bash
docker compose exec postgres createdb -U postgres sprout_test
```

## Commands

### Backend (`backend/`)

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API with reload on change |
| `npm run build` / `npm start` | Compiles to `dist/` and runs it |
| `npm run typecheck` | Type-checks without emitting files |
| `npm test` | Runs the Vitest and supertest suites against `sprout_test` |
| `npm run db:migrate` | Applies pending SQL migrations |
| `npm run db:seed` | Loads development data into an empty database |
| `npm run email:dev` | Previews the React Email templates |
| `npm run format:check` | Checks Prettier formatting |

### Frontend (`frontend/`)

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server on port 3000 |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Generates Next.js types, then runs `tsc` |
| `npm run lint` | Runs ESLint |
| `npm run test:e2e` | Runs the Playwright tests in `frontend/e2e/` |
| `npm run format:check` | Checks Prettier formatting |

## Testing

- **Backend:** `cd backend && npm test`. The suites need PostgreSQL to be running. Migrations are applied to `sprout_test` before the tests start, and tests inject fake email and storage services, so no test contacts Resend or Google Cloud. To use a different database, set `TEST_DATABASE_URL`.
- **Frontend:** `cd frontend && npm run typecheck && npm run lint && npm run build`, plus `npm run test:e2e` for the Playwright suite.

## Configuration

The backend reads these variables and checks them at startup. A missing or malformed value stops the process and names the variable. Values are never printed. The full list, with comments, is in `backend/.env.example`.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Required. `development`, `test` or `production`. |
| `PORT` | Port for the API. Defaults to 8080. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | Signs session tokens. At least 32 characters. |
| `APP_URL` | Frontend origin, used for reset links and the CSRF origin check. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email provider key and sender address. |
| `GCS_BINARY_BUCKET`, `GCS_ICON_BUCKET` | Storage buckets for binaries and icons. |
| `TRUST_PROXY_HOPS` | Number of proxies in front of the API. |

The frontend needs one server-side variable, `BACKEND_URL`, listed in `frontend/.env.example`. Real `.env` files are never committed.

## Deployment

- **Backend:** `backend/deploy.sh` builds the image with Cloud Build, runs the migration job, and then rolls out the Cloud Run service. Migrations always run before the new code serves traffic.
- **Frontend:** a Vercel project with `frontend/` as its root directory and `BACKEND_URL` set to the Cloud Run URL. Requests to `/api/*` are rewritten to the backend, so the session cookie stays on the Vercel domain.
