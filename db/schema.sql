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

-- Small key/value store for the server's own bookkeeping
-- (e.g. which ADMIN_PASSWORD value was last applied).
CREATE TABLE IF NOT EXISTS app_settings (
  key   VARCHAR(60) PRIMARY KEY,
  value TEXT        NOT NULL
);

-- Login sessions (used by connect-pg-simple, so people stay logged in
-- even when Render restarts the server).
CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR      NOT NULL PRIMARY KEY,
  sess   JSON         NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);

-- Google sign-in (added later, so these use ALTER ... IF NOT EXISTS).
-- google_sub is Google's permanent id for the person; accounts created
-- with Google have no password until the member sets one.
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(254);
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- ===== Version 3 additions (all safe to run more than once) =====

-- Series: groups works together, e.g. the chapters of "A Year to Burn".
CREATE TABLE IF NOT EXISTS series (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(120) NOT NULL UNIQUE,
  title       VARCHAR(120) NOT NULL,
  description VARCHAR(600) NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- A work can belong to one series (series_order is its chapter / part number)
-- and have any number of tags (lowercase words such as "aldenmere" or "sketch").
ALTER TABLE posts ADD COLUMN IF NOT EXISTS series_id INTEGER REFERENCES series (id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS series_order INTEGER;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS posts_series_idx ON posts (series_id, series_order);
CREATE INDEX IF NOT EXISTS posts_tags_idx ON posts USING GIN (tags);

-- Every picture, video clip and audio file of a work, in reading order.
-- posts.image_url is kept as the work's cover (the first picture) for cards and thumbnails.
CREATE TABLE IF NOT EXISTS post_media (
  id         SERIAL PRIMARY KEY,
  post_id    INTEGER      NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  position   INTEGER      NOT NULL DEFAULT 0,
  kind       VARCHAR(10)  NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'document')),
  url        TEXT         NOT NULL,
  public_id  TEXT,
  caption    VARCHAR(200) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS post_media_post_idx ON post_media (post_id, position);

-- Works posted before version 3 had a single image: copy it into post_media once.
INSERT INTO post_media (post_id, position, kind, url, public_id)
SELECT p.id, 0, 'image', p.image_url, p.image_public_id
  FROM posts p
 WHERE p.image_url IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id);
-- From now on post_media owns those files (so they are deleted once, from there).
UPDATE posts p SET image_public_id = NULL
 WHERE p.image_public_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.public_id = p.image_public_id);

-- Comment replies (one level: a reply always hangs under a top-level comment) and edits.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES comments (id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS comments_user_idx ON comments (user_id, created_at DESC);

-- Profile pictures.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_public_id TEXT;

-- "Forgot password" links. Only a SHA-256 hash of the token is stored,
-- so someone who reads the database still can't use a link.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash CHAR(64)    PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);

-- Stories: a logline (one-sentence pitch) and a cover picture for each series.
ALTER TABLE series ADD COLUMN IF NOT EXISTS logline VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE series ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE series ADD COLUMN IF NOT EXISTS cover_public_id TEXT;

-- Works: a logline, which section of a story they belong to, and an optional publish time.
-- section: 'main' (chapters and finished pieces) or 'concept-art'.
-- A work is public when published = TRUE and publish_at is empty or already in the past.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS logline VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS section VARCHAR(20) NOT NULL DEFAULT 'main';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE posts ADD CONSTRAINT posts_section_check CHECK (section IN ('main', 'concept-art'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- role: 'page' (shown in the work) or 'cover' (only used as the work's cover picture).
ALTER TABLE post_media ADD COLUMN IF NOT EXISTS role VARCHAR(10) NOT NULL DEFAULT 'page';

-- Characters, each with a profile and pictures (a portrait plus concept art).
CREATE TABLE IF NOT EXISTS characters (
  id           SERIAL PRIMARY KEY,
  slug         VARCHAR(120) NOT NULL UNIQUE,
  series_id    INTEGER      REFERENCES series (id) ON DELETE SET NULL,
  name         VARCHAR(120) NOT NULL,
  role         VARCHAR(80)  NOT NULL DEFAULT '',
  tagline      VARCHAR(200) NOT NULL DEFAULT '',
  profile      TEXT         NOT NULL DEFAULT '',
  sort_order   INTEGER,
  published    BOOLEAN      NOT NULL DEFAULT FALSE,
  publish_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS characters_series_idx ON characters (series_id, sort_order);

-- role: 'portrait' (the main picture) or 'concept' (concept art and design sheets).
CREATE TABLE IF NOT EXISTS character_media (
  id           SERIAL PRIMARY KEY,
  character_id INTEGER      NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  position     INTEGER      NOT NULL DEFAULT 0,
  role         VARCHAR(10)  NOT NULL DEFAULT 'concept' CHECK (role IN ('portrait', 'concept')),
  url          TEXT         NOT NULL,
  public_id    TEXT,
  caption      VARCHAR(200) NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS character_media_idx ON character_media (character_id, position);

-- Updates: news and announcements, posted from the dashboard like any other work.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_category_check;
ALTER TABLE posts ADD CONSTRAINT posts_category_check
  CHECK (category IN ('story-art', 'anime', 'writing', 'updates'));

-- The font a work's text is shown in: theme, serif, typewriter, handwritten or clean.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS font VARCHAR(20) NOT NULL DEFAULT 'theme';

-- Messages sent with the contact form (also emailed to CONTACT_EMAIL when email is set up).
CREATE TABLE IF NOT EXISTS contact_messages (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  email      VARCHAR(254)  NOT NULL,
  subject    VARCHAR(150)  NOT NULL DEFAULT '',
  message    VARCHAR(5000) NOT NULL,
  emailed    BOOLEAN       NOT NULL DEFAULT FALSE,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON contact_messages (created_at DESC);

-- "More products by us": other projects shown on the /products page.
CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(120)  NOT NULL UNIQUE,
  name            VARCHAR(120)  NOT NULL,
  tagline         VARCHAR(200)  NOT NULL DEFAULT '',
  status          VARCHAR(40)   NOT NULL DEFAULT '',
  description     TEXT          NOT NULL DEFAULT '',
  link            VARCHAR(500),
  link_label      VARCHAR(40)   NOT NULL DEFAULT '',
  image_url       TEXT,
  image_public_id TEXT,
  sort_order      INTEGER,
  published       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ===== Version 4: Afterframe, the creator platform =====

-- Who owns each work, story and character. Older rows are given to the admin
-- (God's Banditos) by src/migrate.js once the admin account exists.
ALTER TABLE posts      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE series     ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS posts_user_idx ON posts (user_id, created_at DESC);

-- Anime updates are posts in the 'news' category (shown on Afterframe only).
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_category_check;
ALTER TABLE posts ADD CONSTRAINT posts_category_check
  CHECK (category IN ('story-art', 'anime', 'writing', 'updates', 'news'));

-- A creator's public profile on Afterframe. status: pending -> approved (or rejected / suspended).
CREATE TABLE IF NOT EXISTS creator_profiles (
  user_id        INTEGER      PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  handle         VARCHAR(30)  NOT NULL UNIQUE,
  name           VARCHAR(80)  NOT NULL,
  tagline        VARCHAR(160) NOT NULL DEFAULT '',
  bio            TEXT         NOT NULL DEFAULT '',
  kinds          TEXT[]       NOT NULL DEFAULT '{}',
  links          TEXT         NOT NULL DEFAULT '[]',
  banner_url     TEXT,
  banner_public_id TEXT,
  status         VARCHAR(12)  NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  application    TEXT         NOT NULL DEFAULT '',
  review_note    VARCHAR(500) NOT NULL DEFAULT '',
  featured       BOOLEAN      NOT NULL DEFAULT FALSE,
  can_write_news BOOLEAN      NOT NULL DEFAULT FALSE,
  agreement_accepted_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  approved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS creator_profiles_status_idx ON creator_profiles (status);

-- Viewers following creators.
CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  creator_id  INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, creator_id),
  CHECK (follower_id <> creator_id)
);
CREATE INDEX IF NOT EXISTS follows_creator_idx ON follows (creator_id);

-- When a member last opened their Following feed (for "new releases" alerts),
-- and when they accepted the Terms of Service and Privacy Policy.
ALTER TABLE users ADD COLUMN IF NOT EXISTS feed_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Reports of works, comments or creators that may break the rules.
CREATE TABLE IF NOT EXISTS reports (
  id          SERIAL PRIMARY KEY,
  reporter_id INTEGER      REFERENCES users (id) ON DELETE SET NULL,
  target_type VARCHAR(10)  NOT NULL CHECK (target_type IN ('post', 'comment', 'creator')),
  target_id   INTEGER      NOT NULL,
  reason      VARCHAR(30)  NOT NULL,
  details     VARCHAR(1000) NOT NULL DEFAULT '',
  status      VARCHAR(10)  NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);
