-- Initial schema: the blueprint §4 DDL plus the plan's fixes: hashed reset tokens (G3),
-- NOT NULL foreign keys and rating (G6), and TIMESTAMPTZ everywhere (G7).
-- The runner wraps this file in a transaction.

-- Trigram matching for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Developers and regular users, told apart by role
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL, -- lower-cased and trimmed by the app (G10)
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('developer', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only sha256(token) is stored; the raw token exists only in the emailed link (G3)
CREATE TABLE password_resets (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX password_resets_user_id_idx ON password_resets (user_id);

-- Apps uploaded by developers
CREATE TABLE apps (
  id SERIAL PRIMARY KEY,
  developer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  tagline VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  version VARCHAR(20) NOT NULL,
  file_url TEXT NOT NULL, -- gs://<binaries bucket>/<key>, never returned to clients
  icon_url TEXT, -- public URL in the icons bucket
  download_count INT NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN trigram indexes serve both `title % $1` and `$1 <% description` (G4)
CREATE INDEX apps_title_trgm_idx ON apps USING gin (title gin_trgm_ops);
CREATE INDEX apps_desc_trgm_idx ON apps USING gin (description gin_trgm_ops);
CREATE INDEX apps_developer_id_idx ON apps (developer_id);
CREATE INDEX apps_category_idx ON apps (category);

-- One review per (user, app); writes upsert ON CONFLICT ON CONSTRAINT unique_user_app_review
CREATE TABLE reviews (
  id SERIAL PRIMARY KEY,
  app_id INT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_app_review UNIQUE (app_id, user_id)
);

-- unique_user_app_review already indexes app_id lookups; this also serves the newest-first list
CREATE INDEX reviews_app_id_created_at_idx ON reviews (app_id, created_at DESC);
-- Lets the users -> reviews cascade find a user's reviews without a full scan
CREATE INDEX reviews_user_id_idx ON reviews (user_id);
