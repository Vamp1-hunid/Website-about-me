// src/routes/search.js
//   GET /api/search?q=...   searches works, stories, characters and products at once
//   GET /api/products       the "More products by us" list

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const storage = require("../storage");
const { VISIBLE, SELECT_POST, toPost } = require("./posts");
const { CHAR_VISIBLE } = require("./stories");

const router = express.Router();

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Searching very fast. Please wait a moment." }
});

router.get("/search", searchLimiter, async function (req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
  if (q.length < 2) return res.json({ q: q, works: [], stories: [], characters: [], products: [] });
  const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";

  const works = await db.query(
    `${SELECT_POST} WHERE ${VISIBLE} AND (p.title ILIKE $1 OR p.summary ILIKE $1 OR p.logline ILIKE $1
        OR array_to_string(p.tags, ' ') ILIKE $1 OR p.body ILIKE $1)
      ORDER BY (p.title ILIKE $1) DESC, p.created_at DESC LIMIT 24`,
    [like]
  );
  const stories = await db.query(
    `SELECT s.* FROM series s
      WHERE (s.title ILIKE $1 OR s.logline ILIKE $1 OR s.description ILIKE $1)
        AND (EXISTS (SELECT 1 FROM posts p WHERE p.series_id = s.id AND ${VISIBLE})
          OR EXISTS (SELECT 1 FROM characters c WHERE c.series_id = s.id AND ${CHAR_VISIBLE}))
      ORDER BY s.title LIMIT 12`,
    [like]
  );
  const characters = await db.query(
    `SELECT c.slug, c.name, c.role, c.tagline,
       (SELECT m.url FROM character_media m WHERE m.character_id = c.id ORDER BY (m.role = 'portrait') DESC, m.position LIMIT 1) AS portrait_url
       FROM characters c
      WHERE ${CHAR_VISIBLE} AND (c.name ILIKE $1 OR c.role ILIKE $1 OR c.tagline ILIKE $1 OR c.profile ILIKE $1)
      ORDER BY (c.name ILIKE $1) DESC, c.name LIMIT 12`,
    [like]
  );
  const products = await db.query(
    `SELECT * FROM products WHERE published AND (name ILIKE $1 OR tagline ILIKE $1 OR description ILIKE $1)
      ORDER BY sort_order NULLS LAST, name LIMIT 12`,
    [like]
  );

  res.json({
    q: q,
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


/* ---------- "Fund the Heist": the support / donation button ---------- */

const SUPPORT_TYPES = ["card", "mobile-money", "paypal", "bank", "link"];

const DEFAULT_SUPPORT = {
  enabled: false,
  title: "Fund the heist",
  message: "Every story here is made by one person. If you enjoy the work, you can chip in to keep the presses running.",
  methods: []
};

async function readSupport() {
  const { rows } = await db.query("SELECT value FROM app_settings WHERE key = 'support'");
  try {
    return Object.assign({}, DEFAULT_SUPPORT, rows[0] ? JSON.parse(rows[0].value) : {});
  } catch (error) {
    return Object.assign({}, DEFAULT_SUPPORT);
  }
}

// GET /api/support -> what the button shows (nothing at all while it's switched off)
router.get("/support", async function (req, res) {
  const support = await readSupport();
  if (!support.enabled || !support.methods.length) return res.json({ enabled: false });
  res.json(support);
});


module.exports = router;
module.exports.PLATFORMS = PLATFORMS;
module.exports.readSocials = readSocials;
module.exports.SUPPORT_TYPES = SUPPORT_TYPES;
module.exports.readSupport = readSupport;
