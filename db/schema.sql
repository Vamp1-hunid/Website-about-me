-- db/schema.sql
-- Database tables for the website. Safe to run more than once:
-- "IF NOT EXISTS" skips anything that is already there.

-- Accounts. role is 'admin' (only Mwamba) or 'member' (the public).
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,
  display_name  VARCHAR(60)  NOT NULL,
  password_hash TEXT         NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Works that Mwamba publishes: story art, anime works and written pieces.
-- image_url points at Cloudinary (or /uploads/ when testing on a laptop).
CREATE TABLE IF NOT EXISTS posts (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(120) NOT NULL UNIQUE,
  category        VARCHAR(20)  NOT NULL CHECK (category IN ('story-art', 'anime', 'writing')),
  title           VARCHAR(120) NOT NULL,
  summary         VARCHAR(300) NOT NULL DEFAULT '',
  body            TEXT         NOT NULL DEFAULT '',
  image_url       TEXT,
  image_public_id TEXT,
  published       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at DESC);

-- Comments from members. Deleting a post or a user removes their comments too.
CREATE TABLE IF NOT EXISTS comments (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id    INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  body       VARCHAR(1000) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at);

-- One like per member per post (the primary key stops double likes).
CREATE TABLE IF NOT EXISTS likes (
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id    INTEGER     NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- A member's saved favourites, shown on their profile page.
CREATE TABLE IF NOT EXISTS favourites (
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  post_id    INTEGER     NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- Login sessions (used by connect-pg-simple, so people stay logged in
-- even when Render restarts the server).
CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR      NOT NULL PRIMARY KEY,
  sess   JSON         NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);
