// src/routes/search.js
//   GET /api/search?q=...   searches works, stories, characters and products at once
//   GET /api/products       the "More products by us" list

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const storage = require("../storage");
const { VISIBLE, SELECT_POST, toPost, BANDITOS_ONLY, audienceSql, contentFilterSql } = require("./posts");
const { CHAR_VISIBLE } = require("./stories");

const router = express.Router();
const flagsLib = require("../flags");

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Searching very fast. Please wait a moment." }
});

// What the search filter can narrow results to. Each type lists the work categories it covers.
const TYPES = {
  all: null,
  accounts: [],
  posts: null,
  episodes: ["series", "anime"],
  films: ["film"],
  art: ["art", "story-art", "comedy", "meme"],
  writing: ["writing", "thoughts", "novel", "poetry"],
  books: ["novel", "storybook", "educational"],
  music: ["song"],
  tutorials: ["tutorial"],
  stories: [],
  characters: [],
  news: [],
  products: []
};

router.get("/search", flagsLib.requireFlag("search", { adminAlways: true }), searchLimiter, async function (req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  const hub = true; // every creator's works (God's Banditos has its own site now)
  const type = Object.prototype.hasOwnProperty.call(TYPES, req.query.type) ? req.query.type : "all";
  const empty = { q: q, type: type, works: [], stories: [], characters: [], products: [], creators: [], accounts: [], news: [] };
  if (q.length < 2) return res.json(empty);
  const want = function (name) { return type === "all" || type === name; };
  const wantWorks = type === "all" || type === "posts" || Array.isArray(TYPES[type]) && TYPES[type].length > 0;
  // Forgiving match (see ch_match in db/schema.sql): case, hyphens, spaces and small typos don't matter.
  const like = q.replace(/[\\%_]/g, " ").replace(/\s+/g, " ").trim();
  const workScope = hub ? "" : " AND " + BANDITOS_ONLY;
  const ownerScope = function (alias) { return hub ? "" : " AND " + alias + ".user_id IN (SELECT id FROM users WHERE role = 'admin')"; };
  const none = { rows: [] };
  const cats = TYPES[type] && TYPES[type].length ? TYPES[type] : null;

  const works = !wantWorks ? none : await db.query(
    `${SELECT_POST} WHERE ${VISIBLE}${workScope} AND p.category <> 'news'
        AND ($2::text[] IS NULL OR p.category = ANY($2::text[]) OR ($3 AND p.series_id IS NOT NULL))
        AND ${audienceSql(4)} AND ${contentFilterSql(4)}
        AND (ch_match(p.title, $1) OR ch_match(p.summary, $1) OR ch_match(p.logline, $1)
        OR ch_match(array_to_string(p.tags, ' '), $1) OR ch_match(p.body, $1))
      ORDER BY ch_score(p.title, $1) DESC, p.created_at DESC LIMIT ${type === "all" ? 24 : 48}`,
    [like, cats, type === "episodes", req.session && req.session.user ? req.session.user.id : null]
  );
  const stories = !want("stories") ? none : await db.query(
    `SELECT s.* FROM series s
      WHERE (ch_match(s.title, $1) OR ch_match(s.logline, $1) OR ch_match(s.description, $1))${ownerScope("s")}
        AND (EXISTS (SELECT 1 FROM posts p WHERE p.series_id = s.id AND ${VISIBLE})
          OR EXISTS (SELECT 1 FROM characters c WHERE c.series_id = s.id AND ${CHAR_VISIBLE}))
      ORDER BY s.title LIMIT 12`,
    [like]
  );
  const characters = !want("characters") ? none : await db.query(
    `SELECT c.slug, c.name, c.role, c.tagline,
       (SELECT m.url FROM character_media m WHERE m.character_id = c.id ORDER BY (m.role = 'portrait') DESC, m.position LIMIT 1) AS portrait_url
       FROM characters c
      WHERE ${CHAR_VISIBLE}${ownerScope("c")} AND (ch_match(c.name, $1) OR ch_match(c.role, $1) OR ch_match(c.tagline, $1) OR ch_match(c.profile, $1))
      ORDER BY ch_score(c.name, $1) DESC, c.name LIMIT 12`,
    [like]
  );
  const products = !want("products") || hub ? none : await db.query(
    `SELECT * FROM products WHERE published AND (ch_match(name, $1) OR ch_match(tagline, $1) OR ch_match(description, $1))
      ORDER BY sort_order NULLS LAST, name LIMIT 12`,
    [like]
  );

  let creators = none;
  let accounts = none;
  let news = none;
  if (hub) {
    if (want("accounts")) {
      creators = await db.query(
        `SELECT cp.handle, cp.name, cp.tagline, u.avatar_url FROM creator_profiles cp JOIN users u ON u.id = cp.user_id
          WHERE cp.status = 'approved' AND (ch_match(cp.name, $1) OR ch_match(cp.handle, $1) OR ch_match(cp.tagline, $1) OR ch_match(cp.bio, $1))
          ORDER BY ch_score(cp.name, $1) DESC, cp.name LIMIT 12`,
        [like]
      );
      // Member accounts are only listed for signed-in people.
      if (req.session && req.session.user) {
        accounts = await db.query(
          `SELECT u.username, u.display_name, u.avatar_url FROM users u
            WHERE u.status = 'active' AND (ch_match(u.username, $1) OR ch_match(u.display_name, $1))
              AND NOT EXISTS (SELECT 1 FROM creator_profiles cp WHERE cp.user_id = u.id AND cp.status = 'approved')
            ORDER BY ch_score(u.username, $1) DESC, u.username LIMIT 12`,
          [like]
        );
      }
    }
    if (want("news") && await flagsLib.isOn("updates", req)) {
      news = await db.query(
        `${SELECT_POST} WHERE ${VISIBLE} AND p.category = 'news' AND (ch_match(p.title, $1) OR ch_match(p.summary, $1) OR ch_match(p.body, $1))
          ORDER BY p.created_at DESC LIMIT 12`,
        [like]
      );
    }
  }

  res.json({
    q: q,
    type: type,
    creators: creators.rows.map(function (c) {
      return { handle: c.handle, name: c.name, tagline: c.tagline, avatarUrl: storage.avatarUrl(c.avatar_url) || null };
    }),
    accounts: accounts.rows.map(function (u) {
      return { username: u.username, displayName: u.display_name, avatarUrl: storage.avatarUrl(u.avatar_url) || null };
    }),
    news: news.rows.map(function (row) { return toPost(row, false); }),
    works: works.rows.map(function (row) { return toPost(row, false); }),
    stories: stories.rows.map(function (s) {
      return { slug: s.slug, title: s.title, logline: s.logline, coverUrl: storage.thumbnailUrl(s.cover_url) || null };
    }),
    characters: characters.rows.map(function (c) {
      return { slug: c.slug, name: c.name, role: c.role, tagline: c.tagline, portraitUrl: storage.thumbnailUrl(c.portrait_url) || null };
    }),
    products: products.rows.map(publicProduct)
  });
});

function publicProduct(row) {
  return {
    slug: row.slug, name: row.name, tagline: row.tagline, status: row.status, description: row.description,
    link: row.link, linkLabel: row.link_label, imageUrl: storage.thumbnailUrl(row.image_url) || null
  };
}

router.get("/products", async function (req, res) {
  const { rows } = await db.query("SELECT * FROM products WHERE published ORDER BY sort_order NULLS LAST, created_at DESC");
  res.json({ products: rows.map(publicProduct) });
});

/* ---------- Social media links (edited in the dashboard, shown under Contact) ---------- */

const PLATFORMS = {
  instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", x: "X (Twitter)",
  facebook: "Facebook", github: "GitHub", threads: "Threads", discord: "Discord", whatsapp: "WhatsApp",
  pinterest: "Pinterest", artstation: "ArtStation", email: "Email", other: "Website"
};

async function readSocials() {
  const { rows } = await db.query("SELECT value FROM app_settings WHERE key = 'social_links'");
  let links = [];
  try { links = rows[0] ? JSON.parse(rows[0].value) : []; } catch (error) { links = []; }
  return links.map(function (l) {
    return { platform: l.platform, url: l.url, label: l.label || PLATFORMS[l.platform] || "Link" };
  });
}

// GET /api/socials
router.get("/socials", async function (req, res) {
  res.json({ links: await readSocials(), platforms: PLATFORMS });
});


/* ---------- "Feed the hive": the support / donation button ---------- */

const SUPPORT_TYPES = ["card", "mobile-money", "paypal", "bank", "link"];

const DEFAULT_SUPPORT = {
  enabled: false,
  title: "Feed the hive",
  message: "Enjoying Chapterhive? Chip in to help keep the hive growing: every bit helps us build more for creators and readers.",
  methods: []
};

async function readSupport() {
  const { rows } = await db.query("SELECT value FROM app_settings WHERE key = 'support'");
  try {
    const saved = Object.assign({}, DEFAULT_SUPPORT, rows[0] ? JSON.parse(rows[0].value) : {});
    // The old God's Banditos wording becomes Chapterhive's bee-themed one (a custom title is kept).
    if (!saved.title || saved.title.trim().toLowerCase() === "fund the heist") saved.title = DEFAULT_SUPPORT.title;
    // The old message promised Chapterhive is free; paid plans are coming, so it's replaced (a custom message is kept).
    if (!saved.message || /is free for creators and readers/i.test(saved.message)) saved.message = DEFAULT_SUPPORT.message;
    return saved;
  } catch (error) {
    return Object.assign({}, DEFAULT_SUPPORT);
  }
}

// GET /api/support -> what the button shows (nothing at all while it's switched off)
router.get("/support", async function (req, res) {
  const support = await readSupport();
  if (!(await flagsLib.isOn("donations", req))) return res.json({ enabled: false });
  // Switched on but no payment methods yet: the button still shows, with a "coming soon" note.
  if (!support.enabled || !support.methods.length) {
    return res.json({ enabled: true, comingSoon: true, title: support.title || "Feed the hive",
      message: "Ways to support Chapterhive are being set up. Check back soon!", methods: [] });
  }
  res.json(support);
});


module.exports = router;
module.exports.PLATFORMS = PLATFORMS;
module.exports.readSocials = readSocials;
module.exports.SUPPORT_TYPES = SUPPORT_TYPES;
module.exports.readSupport = readSupport;
