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
-- (The list of allowed categories is set once, in the Version 5 section below. Re-applying an
-- older, shorter list here would fail on restart once posts in newer categories exist.)

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

-- ===== Version 4: Chapterhive, the creator platform =====

-- Who owns each work, story and character. Older rows are given to the admin
-- (God's Banditos) by src/migrate.js once the admin account exists.
ALTER TABLE posts      ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE series     ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS posts_user_idx ON posts (user_id, created_at DESC);

-- Anime updates are posts in the 'news' category (shown on Chapterhive only).
-- (The list of allowed categories is set once, in the Version 5 section below. Re-applying an
-- older, shorter list here would fail on restart once posts in newer categories exist.)

-- A creator's public profile on Chapterhive. status: pending -> approved (or rejected / suspended).
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

-- ===== Chapterhive collabs: creators looking for each other =====
-- looking_for / offering hold a role from the list in src/routes/collabs.js,
-- or 'other' with the creator's own words in looking_for_other / offering_other.
CREATE TABLE IF NOT EXISTS collab_posts (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title             VARCHAR(120)  NOT NULL,
  looking_for       VARCHAR(30)   NOT NULL,
  looking_for_other VARCHAR(80)   NOT NULL DEFAULT '',
  offering          VARCHAR(30)   NOT NULL DEFAULT '',
  offering_other    VARCHAR(80)   NOT NULL DEFAULT '',
  compensation      VARCHAR(20)   NOT NULL DEFAULT 'negotiable',
  description       TEXT          NOT NULL DEFAULT '',
  series_id         INTEGER       REFERENCES series (id) ON DELETE SET NULL,
  status            VARCHAR(10)   NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS collab_posts_status_idx ON collab_posts (status, created_at DESC);

-- "I'm interested" replies. Only the person who posted the request (and the replier) can read them.
CREATE TABLE IF NOT EXISTS collab_replies (
  id         SERIAL PRIMARY KEY,
  collab_id  INTEGER       NOT NULL REFERENCES collab_posts (id) ON DELETE CASCADE,
  user_id    INTEGER       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message    VARCHAR(1500) NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (collab_id, user_id)
);

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('post', 'comment', 'creator', 'collab'));

-- ===== Version 5 =====

-- Account standing: banned accounts can't log in; suspended ones can't until suspended_until.
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS status_reason VARCHAR(500) NOT NULL DEFAULT '';
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended', 'banned'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Presence, streaks and beta testing.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_online BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_best INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_day DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_beta BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS announcements_seen_at TIMESTAMPTZ;

-- Review: works by creators other than the admin wait for approval before going public.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_status VARCHAR(10) NOT NULL DEFAULT 'approved';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS review_note VARCHAR(1500) NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE posts ADD CONSTRAINT posts_review_check CHECK (review_status IN ('approved', 'pending', 'declined'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS posts_review_idx ON posts (review_status, submitted_at);
-- Works that were already public before version 5 don't send "new post" notifications now.
UPDATE posts SET notified_at = COALESCE(notified_at, NOW()) WHERE notified_at IS NULL AND created_at < NOW() - INTERVAL '1 minute';

-- Chapterhive is for every kind of creative post.
ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_category_check;
ALTER TABLE posts ADD CONSTRAINT posts_category_check CHECK (category IN (
  'story-art', 'anime', 'writing', 'updates', 'news',
  'art', 'comedy', 'film', 'series', 'meme', 'thoughts', 'poll',
  'novel', 'storybook', 'educational', 'poetry', 'song', 'trailer'));

-- Polls and questionnaires attached to a post (questions, options, when results show).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS form JSONB;
CREATE TABLE IF NOT EXISTS form_responses (
  post_id    INTEGER     NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  answers    JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);

-- The notification bell.
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  type       VARCHAR(20)  NOT NULL,
  title      VARCHAR(160) NOT NULL,
  body       VARCHAR(1500) NOT NULL DEFAULT '',
  link       VARCHAR(300) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  read_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- Announcements from the admin, shown in everyone's bell (one row, not one per user).
CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  title      VARCHAR(160) NOT NULL,
  body       VARCHAR(2000) NOT NULL DEFAULT '',
  link       VARCHAR(300) NOT NULL DEFAULT '',
  audience   VARCHAR(10)  NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'creators')),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Feature flags: try features on the live site before everyone gets them.
-- audience: off | admin (only you) | beta (you + beta testers) | everyone
CREATE TABLE IF NOT EXISTS feature_flags (
  key         VARCHAR(40)  PRIMARY KEY,
  label       VARCHAR(80)  NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  audience    VARCHAR(10)  NOT NULL DEFAULT 'admin' CHECK (audience IN ('off', 'admin', 'beta', 'everyone')),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- The admin inbox now holds contact messages, suggestions and business enquiries.
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS kind VARCHAR(12) NOT NULL DEFAULT 'contact';
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS company VARCHAR(120) NOT NULL DEFAULT '';
ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users (id) ON DELETE SET NULL;

-- v7: international-standard sign-up details.
-- birth_date: needed for age checks (13+ to join; 13-17 get a teen account). Never shown publicly.
ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS country CHAR(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verify_token VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_privacy VARCHAR(10) NOT NULL DEFAULT 'everyone';
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_chat_privacy_check CHECK (chat_privacy IN ('everyone', 'nobody'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- v7: chat between members (one-to-one conversations).
CREATE TABLE IF NOT EXISTS chat_threads (
  id         SERIAL PRIMARY KEY,
  user_a     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,  -- always the smaller user id
  user_b     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  a_read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  b_read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id         SERIAL PRIMARY KEY,
  thread_id  INTEGER NOT NULL REFERENCES chat_threads (id) ON DELETE CASCADE,
  sender_id  INTEGER REFERENCES users (id) ON DELETE SET NULL,
  body       VARCHAR(2000) NOT NULL DEFAULT '',
  post_id    INTEGER REFERENCES posts (id) ON DELETE SET NULL,  -- a shared work (story, video, art...)
  deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON chat_messages (thread_id, id);
CREATE TABLE IF NOT EXISTS chat_blocks (
  blocker_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('post', 'comment', 'creator', 'collab', 'message'));

-- v8: account plans (Premium is queued: hidden until the "premium" feature flag is switched on).
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(10) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_until TIMESTAMPTZ;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'premium'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A premium creator's page style: theme, accent colour and wallpaper picture.
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS page_theme VARCHAR(20);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS page_accent VARCHAR(7);
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS page_wallpaper_url TEXT;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS page_wallpaper_public_id TEXT;
-- People who asked to hear when Premium launches.
CREATE TABLE IF NOT EXISTS premium_waitlist (
  user_id    INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- v8: site features can be scheduled to launch for everyone at a set time,
-- and are grouped on the admin "Site features" tab.
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS launch_at TIMESTAMPTZ;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS grp VARCHAR(30) NOT NULL DEFAULT 'Extras';

-- v8: genres for browsing (horror, sci-fi, romance, education ...). A post can have up to three.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS genres VARCHAR(20)[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS posts_genres_idx ON posts USING GIN (genres);

-- v9: what visitors see while a feature isn't live for them: hide it, or show it with a friendly notice.
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS display VARCHAR(12) NOT NULL DEFAULT 'hide';
DO $$ BEGIN
  ALTER TABLE feature_flags ADD CONSTRAINT feature_flags_display_check CHECK (display IN ('hide', 'soon', 'maintenance'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- v9: creator rankings. Recalculated regularly from the last 30 days of activity.
-- scope: 'overall' (top 10 across everything) or a shelf ('books', 'comics', ...) for the top 5 there.
CREATE TABLE IF NOT EXISTS creator_ranks (
  user_id     INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  scope       VARCHAR(20) NOT NULL,
  rank        INTEGER     NOT NULL,
  score       INTEGER     NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, scope)
);
CREATE INDEX IF NOT EXISTS creator_ranks_scope_idx ON creator_ranks (scope, rank);

-- v10: gender (private, optional "prefer not to say") and organisation accounts.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(12);
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female', 'unspecified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type VARCHAR(12) NOT NULL DEFAULT 'person';
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_account_type_check CHECK (account_type IN ('person', 'organisation'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Organisation / group accounts: one shared account run by a named contact person, with a public team list.
CREATE TABLE IF NOT EXISTS organisations (
  user_id      INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  org_name     VARCHAR(100) NOT NULL,
  org_type     VARCHAR(20)  NOT NULL,
  website      VARCHAR(300) NOT NULL DEFAULT '',
  contact_name VARCHAR(80)  NOT NULL,
  contact_role VARCHAR(80)  NOT NULL DEFAULT '',
  team         JSONB        NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- v11: what each member likes to see. kind: 'category' or 'genre'. weight > 0 = more, < 0 = less.
-- Set by the welcome survey, the "see more / see less" buttons, and quietly by likes and saves.
CREATE TABLE IF NOT EXISTS user_interests (
  user_id    INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       VARCHAR(10) NOT NULL CHECK (kind IN ('category', 'genre')),
  key        VARCHAR(20) NOT NULL,
  weight     INTEGER     NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, kind, key)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
-- v11: a short bio on member pages (creators also have a longer bio on their creator page).
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(300) NOT NULL DEFAULT '';

-- v12: privacy settings.
--  chat_privacy: everyone | following (only creators I follow) | nobody
--  profile_visible: whether other members can open my member page
--  creator_profiles.post_visibility: everyone | members (signed-in only) | followers (only my followers)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_chat_privacy_check;
ALTER TABLE users ADD CONSTRAINT users_chat_privacy_check CHECK (chat_privacy IN ('everyone', 'following', 'nobody'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visible BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS post_visibility VARCHAR(10) NOT NULL DEFAULT 'everyone';
DO $$ BEGIN
  ALTER TABLE creator_profiles ADD CONSTRAINT creator_post_visibility_check CHECK (post_visibility IN ('everyone', 'members', 'followers'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
