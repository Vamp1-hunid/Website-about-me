// src/routes/hub.js
// Chapterhive, the creator platform (/hub):
//   GET  /api/hub/home                       featured creators, latest releases, news posts
//   GET  /api/hub/creators                   the creator directory
//   GET  /api/hub/creators/:handle           one creator's profile
//   POST / DELETE /api/hub/creators/:handle/follow
//   GET  /api/hub/feed, /api/hub/feed/unseen  new releases from creators you follow
//   GET  /api/hub/following                  creators you follow
//   GET  /api/hub/me                         your creator status
//   POST /api/hub/apply                      apply to become a creator
//   PUT  /api/hub/profile                    edit your creator profile
//   GET  /api/hub/studio/overview            numbers for your studio
//   POST /api/hub/reports                    report a work, comment or creator

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const storage = require("../storage");
const { requireLogin } = require("../auth");
const { resolveMedia } = require("../media");
const { VISIBLE, SELECT_POST, toPost } = require("./posts");
const { CHAR_VISIBLE } = require("./stories");

const router = express.Router();

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;
const KINDS = ["manga", "comics", "animation", "illustration", "stories", "comedy", "film", "series", "photography", "music", "memes", "poetry"];
const RESERVED = ["admin", "hub", "studio", "apply", "feed", "news", "creators", "settings", "chapterhive", "afterframe", "support", "help", "legal", "api"];

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." }
});
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 15, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "You've sent a lot of reports. Please wait a while." }
});

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseLinks(value) {
  try { return JSON.parse(value || "[]"); } catch (error) { return []; }
}

function cleanLinks(input) {
  const list = Array.isArray(input) ? input.slice(0, 8) : [];
  const out = [];
  for (const raw of list) {
    const url = text(raw && raw.url, 300);
    if (!url) continue;
    if (!/^https:\/\/[^\s<>"]+$/i.test(url)) return { problem: "Links must start with https://" };
    out.push({ label: text(raw.label, 30) || url.replace(/^https:\/\/(www\.)?/, "").split("/")[0], url: url });
  }
  return { links: out };
}

// The card shown in creator lists.
function toCreatorCard(row) {
  return {
    handle: row.handle,
    name: row.name,
    tagline: row.tagline,
    kinds: row.kinds || [],
    avatarUrl: storage.avatarUrl(row.avatar_url) || null,
    bannerUrl: storage.thumbnailUrl(row.banner_url) || null,
    followers: row.followers || 0,
    works: row.works || 0,
    featured: row.featured,
    isBanditos: row.role === "admin",
    online: !!row.online
  };
}

const CREATOR_SQL = `
  SELECT cp.*, u.username AS account_username, u.avatar_url, u.role, u.created_at AS joined, u.streak_count,
    (u.show_online AND u.last_seen_at > NOW() - INTERVAL '5 minutes') AS online,
    (SELECT COUNT(*) FROM follows f WHERE f.creator_id = cp.user_id)::int AS followers,
    (SELECT COUNT(*) FROM posts p WHERE p.user_id = cp.user_id AND p.category <> 'news' AND ${VISIBLE})::int AS works
  FROM creator_profiles cp JOIN users u ON u.id = cp.user_id`;

/* ---------- Public ---------- */

router.get("/home", async function (req, res) {
  const featured = await db.query(
    CREATOR_SQL + " WHERE cp.status = 'approved' ORDER BY cp.featured DESC, followers DESC, cp.approved_at DESC LIMIT 8"
  );
  const latest = await db.query(
    `${SELECT_POST} WHERE ${VISIBLE} AND p.category NOT IN ('news', 'updates') ORDER BY p.created_at DESC LIMIT 12`
  );
  const news = await db.query(
    `${SELECT_POST} WHERE ${VISIBLE} AND p.category = 'news' ORDER BY p.created_at DESC LIMIT 6`
  );
  const stats = await db.query(
    `SELECT (SELECT COUNT(*) FROM creator_profiles WHERE status = 'approved')::int AS creators,
            (SELECT COUNT(*) FROM posts p WHERE ${VISIBLE} AND p.category <> 'news')::int AS works`
  );
  res.json({
    creators: featured.rows.map(toCreatorCard),
    latest: latest.rows.map(function (r) { return toPost(r, false); }),
    news: news.rows.map(function (r) { return toPost(r, false); }),
    stats: stats.rows[0]
  });
});

// GET /api/hub/creators?q=&kind=&sort=popular|new|name&page=
router.get("/creators", async function (req, res) {
  const page = Math.min(1000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const size = 24;
  const where = ["cp.status = 'approved'"];
  const values = [];
  const q = text(req.query.q, 60);
  if (q) {
    values.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
    where.push(`(cp.name ILIKE $${values.length} OR cp.handle ILIKE $${values.length} OR cp.tagline ILIKE $${values.length})`);
  }
  if (KINDS.includes(req.query.kind)) {
    values.push(req.query.kind);
    where.push(`$${values.length} = ANY (cp.kinds)`);
  }
  const order = { new: "cp.approved_at DESC NULLS LAST", name: "cp.name" }[req.query.sort] || "followers DESC, works DESC, cp.name";
  const total = await db.query("SELECT COUNT(*)::int AS n FROM creator_profiles cp WHERE " + where.join(" AND "), values);
  values.push(size, (page - 1) * size);
  const { rows } = await db.query(
    `${CREATOR_SQL} WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  res.json({ creators: rows.map(toCreatorCard), page: page, pages: Math.max(1, Math.ceil(total.rows[0].n / size)), total: total.rows[0].n });
});

// GET /api/hub/creators/:handle
router.get("/creators/:handle", async function (req, res) {
  const handle = String(req.params.handle).toLowerCase().slice(0, 30);
  const { rows } = await db.query(CREATOR_SQL + " WHERE cp.handle = $1", [handle]);
  const row = rows[0];
  const viewer = req.session.user;
  const isOwner = Boolean(viewer && row && viewer.id === row.user_id);
  if (!row || (row.status !== "approved" && !isOwner && !(viewer && viewer.role === "admin"))) {
    return res.status(404).json({ error: "That creator could not be found." });
  }
  let following = false;
  if (viewer && !isOwner) {
    const f = await db.query("SELECT 1 FROM follows WHERE follower_id = $1 AND creator_id = $2", [viewer.id, row.user_id]);
    following = f.rows.length > 0;
  }
  const series = await db.query(
    `SELECT s.slug, s.title, s.logline, s.cover_url,
       (SELECT COUNT(*) FROM posts p WHERE p.series_id = s.id AND p.section = 'main' AND ${VISIBLE})::int AS chapters,
       (SELECT p.image_url FROM posts p WHERE p.series_id = s.id AND ${VISIBLE} AND p.image_url IS NOT NULL
         ORDER BY p.series_order NULLS LAST, p.created_at LIMIT 1) AS fallback_cover
       FROM series s WHERE s.user_id = $1 ORDER BY s.title`,
    [row.user_id]
  );
  const characters = await db.query(
    `SELECT c.slug, c.name, c.role, c.tagline,
       (SELECT m.url FROM character_media m WHERE m.character_id = c.id ORDER BY (m.role = 'portrait') DESC, m.position LIMIT 1) AS portrait_url
       FROM characters c WHERE c.user_id = $1 AND ${CHAR_VISIBLE} ORDER BY c.sort_order NULLS LAST, c.name LIMIT 48`,
    [row.user_id]
  );
  const card = toCreatorCard(row);
  res.json({
    creator: Object.assign(card, {
      userId: row.user_id,
      username: row.account_username,
      bio: row.bio,
      links: parseLinks(row.links),
      bannerUrl: storage.displayUrl(row.banner_url, "image") || null,
      joined: row.joined,
      status: row.status,
      isOwner: isOwner,
      following: following
    }),
    stories: series.rows
      .filter(function (s) { return s.chapters > 0 || isOwner; })
      .map(function (s) {
        return { slug: s.slug, title: s.title, logline: s.logline, chapters: s.chapters,
          coverUrl: storage.thumbnailUrl(s.cover_url || s.fallback_cover) || null };
      }),
    characters: characters.rows.map(function (c) {
      return { slug: c.slug, name: c.name, role: c.role, tagline: c.tagline, portraitUrl: storage.thumbnailUrl(c.portrait_url) || null };
    })
  });
});

/* ---------- Following ---------- */

async function creatorUserId(handle) {
  const { rows } = await db.query(
    "SELECT user_id FROM creator_profiles WHERE handle = $1 AND status = 'approved'",
    [String(handle).toLowerCase().slice(0, 30)]
  );
  return rows[0] ? rows[0].user_id : null;
}

async function followRoute(req, res) {
  const id = await creatorUserId(req.params.handle);
  if (!id) return res.status(404).json({ error: "That creator could not be found." });
  if (id === req.session.user.id) return res.status(400).json({ error: "You can't follow yourself." });
  let added = null;
  if (req.method === "POST") {
    added = await db.query("INSERT INTO follows (follower_id, creator_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.session.user.id, id]);
  } else {
    await db.query("DELETE FROM follows WHERE follower_id = $1 AND creator_id = $2", [req.session.user.id, id]);
  }
  const count = await db.query("SELECT COUNT(*)::int AS n FROM follows WHERE creator_id = $1", [id]);
  if (req.method === "POST" && added.rowCount) {
    const me = req.session.user;
    const { notify } = require("../notify");
    await notify(id, { type: "follower", title: (me.displayName || me.username) + " followed you", body: "You now have " + count.rows[0].n + " follower" + (count.rows[0].n === 1 ? "" : "s") + ".", link: "/u/" + me.username });
    await require("../users").followerMilestone(id, count.rows[0].n);
  }
  res.json({ following: req.method === "POST", followers: count.rows[0].n });
}
router.post("/creators/:handle/follow", requireLogin, followRoute);
router.delete("/creators/:handle/follow", requireLogin, followRoute);

// GET /api/hub/feed?page=  (also marks the feed as seen)
router.get("/feed", requireLogin, async function (req, res) {
  const page = Math.min(1000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const size = 18;
  const me = req.session.user.id;
  const seen = await db.query("SELECT feed_seen_at FROM users WHERE id = $1", [me]);
  // "New" = released after you started following that creator and after your last visit here.
  const { rows } = await db.query(
    `SELECT q.*, f.created_at AS followed_at FROM (${SELECT_POST} WHERE ${VISIBLE}) q
       JOIN follows f ON f.creator_id = q.user_id AND f.follower_id = $1
      ORDER BY COALESCE(q.publish_at, q.created_at) DESC LIMIT $2 OFFSET $3`,
    [me, size + 1, (page - 1) * size]
  );
  await db.query("UPDATE users SET feed_seen_at = NOW() WHERE id = $1", [me]);
  const lastSeen = seen.rows[0] && seen.rows[0].feed_seen_at;
  res.json({
    posts: rows.slice(0, size).map(function (r) {
      const post = toPost(r, false);
      const released = new Date(r.publish_at || r.created_at);
      post.isNew = released > new Date(r.followed_at) && (!lastSeen || released > new Date(lastSeen));
      return post;
    }),
    page: page,
    hasMore: rows.length > size
  });
});

// GET /api/hub/feed/unseen -> { count }
router.get("/feed/unseen", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM posts p
       JOIN follows f ON f.creator_id = p.user_id AND f.follower_id = $1
       JOIN users u ON u.id = $1
      WHERE ${VISIBLE}
        AND COALESCE(p.publish_at, p.created_at) > GREATEST(f.created_at, COALESCE(u.feed_seen_at, f.created_at))`,
    [req.session.user.id]
  );
  res.json({ count: rows[0].n });
});

router.get("/following", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    CREATOR_SQL + " WHERE cp.status = 'approved' AND cp.user_id IN (SELECT creator_id FROM follows WHERE follower_id = $1) ORDER BY cp.name",
    [req.session.user.id]
  );
  res.json({ creators: rows.map(toCreatorCard) });
});

/* ---------- Becoming a creator ---------- */

async function myProfile(userId) {
  const { rows } = await db.query("SELECT * FROM creator_profiles WHERE user_id = $1", [userId]);
  return rows[0] || null;
}

function toMyProfile(row) {
  if (!row) return null;
  return {
    handle: row.handle, name: row.name, tagline: row.tagline, bio: row.bio, kinds: row.kinds,
    links: parseLinks(row.links), bannerUrl: storage.thumbnailUrl(row.banner_url) || null,
    status: row.status, reviewNote: row.review_note, canWriteNews: row.can_write_news, application: row.application
  };
}

router.get("/me", requireLogin, async function (req, res) {
  res.json({ profile: toMyProfile(await myProfile(req.session.user.id)), isAdmin: req.session.user.role === "admin" });
});

// POST /api/hub/apply { handle, name, tagline, kinds[], application, links[], agree }
router.post("/apply", requireLogin, applyLimiter, async function (req, res) {
  const existing = await myProfile(req.session.user.id);
  if (existing && (existing.status === "approved" || existing.status === "suspended")) {
    return res.status(400).json({ error: existing.status === "approved" ? "You're already an approved creator." : "This account can't apply right now." });
  }
  const values = {
    handle: text(req.body.handle, 30).toLowerCase(),
    name: text(req.body.name, 80),
    tagline: text(req.body.tagline, 160),
    application: text(req.body.application, 2000),
    kinds: (Array.isArray(req.body.kinds) ? req.body.kinds : []).filter(function (k) { return KINDS.includes(k); })
  };
  const links = cleanLinks(req.body.links);
  const problems = [];
  if (!HANDLE_PATTERN.test(values.handle) || RESERVED.includes(values.handle)) {
    problems.push({ field: "handle", message: "Use 3–30 lowercase letters, numbers, - or _ (not starting or ending with - or _)." });
  } else {
    const taken = await db.query("SELECT 1 FROM creator_profiles WHERE handle = $1 AND user_id <> $2", [values.handle, req.session.user.id]);
    if (taken.rows.length) problems.push({ field: "handle", message: "That handle is taken. Try another." });
  }
  if (!values.name) problems.push({ field: "name", message: "Enter your creator name." });
  if (!values.kinds.length) problems.push({ field: "kinds", message: "Choose at least one kind of work." });
  if (values.application.length < 30) problems.push({ field: "application", message: "Tell us a little about your work (at least 30 characters)." });
  if (links.problem) problems.push({ field: "links", message: links.problem });
  if (req.body.agree !== true) problems.push({ field: "agree", message: "You need to accept the Creator Agreement and Content Rules." });
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  await db.query(
    `INSERT INTO creator_profiles (user_id, handle, name, tagline, kinds, application, links, status, agreement_accepted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
     ON CONFLICT (user_id) DO UPDATE SET handle = EXCLUDED.handle, name = EXCLUDED.name, tagline = EXCLUDED.tagline,
       kinds = EXCLUDED.kinds, application = EXCLUDED.application, links = EXCLUDED.links, status = 'pending',
       agreement_accepted_at = NOW(), created_at = NOW()`,
    [req.session.user.id, values.handle, values.name, values.tagline, values.kinds, values.application, JSON.stringify(links.links)]
  );
  res.status(201).json({ profile: toMyProfile(await myProfile(req.session.user.id)) });
});

// PUT /api/hub/profile { name, tagline, bio, kinds[], links[], banner }
router.put("/profile", requireLogin, async function (req, res) {
  const existing = await myProfile(req.session.user.id);
  if (!existing || !["approved", "pending"].includes(existing.status)) {
    return res.status(403).json({ error: "Apply to become a creator first." });
  }
  const values = {
    name: text(req.body.name, 80),
    tagline: text(req.body.tagline, 160),
    bio: typeof req.body.bio === "string" ? req.body.bio.replace(/\r\n/g, "\n").trim().slice(0, 5000) : "",
    kinds: (Array.isArray(req.body.kinds) ? req.body.kinds : []).filter(function (k) { return KINDS.includes(k); })
  };
  const links = cleanLinks(req.body.links);
  const problems = [];
  if (!values.name) problems.push({ field: "name", message: "Enter your creator name." });
  if (links.problem) problems.push({ field: "links", message: links.problem });

  let banner = { url: existing.banner_url, publicId: existing.banner_public_id, changed: false };
  if (req.body.banner === null) {
    banner = { url: null, publicId: null, changed: true };
  } else if (req.body.banner && !req.body.banner.keep) {
    const result = resolveMedia([req.body.banner], [], { roles: ["cover"], kinds: ["image"], max: 1 });
    if (result.problem) problems.push({ field: "banner", message: result.problem });
    else banner = { url: result.items[0].url, publicId: result.items[0].publicId, changed: true };
  }
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  await db.query(
    `UPDATE creator_profiles SET name = $1, tagline = $2, bio = $3, kinds = $4, links = $5, banner_url = $6, banner_public_id = $7
      WHERE user_id = $8`,
    [values.name, values.tagline, values.bio, values.kinds, JSON.stringify(links.links), banner.url, banner.publicId, req.session.user.id]
  );
  if (banner.changed && existing.banner_public_id) await storage.deleteImage(existing.banner_public_id);
  res.json({ profile: toMyProfile(await myProfile(req.session.user.id)) });
});

router.get("/studio/overview", requireLogin, async function (req, res) {
  const me = req.session.user.id;
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM posts p WHERE p.user_id = $1 AND ${VISIBLE})::int AS live,
       (SELECT COUNT(*) FROM posts WHERE user_id = $1 AND published AND publish_at > NOW())::int AS scheduled,
       (SELECT COUNT(*) FROM posts WHERE user_id = $1 AND NOT published)::int AS drafts,
       (SELECT COUNT(*) FROM characters WHERE user_id = $1 AND (NOT published OR publish_at > NOW()))::int AS "characterDrafts",
       (SELECT COUNT(*) FROM characters WHERE user_id = $1)::int AS characters,
       (SELECT COUNT(*) FROM series WHERE user_id = $1)::int AS stories,
       (SELECT COUNT(*) FROM follows WHERE creator_id = $1)::int AS followers,
       (SELECT COUNT(*) FROM likes l JOIN posts p ON p.id = l.post_id WHERE p.user_id = $1)::int AS likes,
       (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id
         WHERE p.user_id = $1 AND c.created_at > NOW() - INTERVAL '7 days')::int AS "commentsWeek"`,
    [me]
  );
  const next = await db.query(
    "SELECT title, slug, publish_at FROM posts WHERE user_id = $1 AND published AND publish_at > NOW() ORDER BY publish_at LIMIT 5",
    [me]
  );
  res.json(Object.assign(rows[0], {
    upcoming: next.rows.map(function (r) { return { title: r.title, slug: r.slug, publishAt: r.publish_at }; })
  }));
});

/* ---------- Reports ---------- */

const REASONS = ["stolen", "explicit", "hate", "harassment", "spam", "spoiler", "other"];

router.post("/reports", requireLogin, reportLimiter, async function (req, res) {
  const type = ["post", "comment", "creator", "collab"].includes(req.body.targetType) ? req.body.targetType : null;
  const id = Number(req.body.targetId);
  const reason = REASONS.includes(req.body.reason) ? req.body.reason : null;
  if (!type || !Number.isInteger(id) || id < 1 || !reason) {
    return res.status(400).json({ error: "Choose what's wrong." });
  }
  const table = { post: "posts", comment: "comments", creator: "creator_profiles", collab: "collab_posts" }[type];
  const column = type === "creator" ? "user_id" : "id";
  const exists = await db.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [id]);
  if (!exists.rows.length) return res.status(404).json({ error: "That could not be found." });
  const dup = await db.query(
    "SELECT 1 FROM reports WHERE reporter_id = $1 AND target_type = $2 AND target_id = $3 AND status = 'open'",
    [req.session.user.id, type, id]
  );
  if (!dup.rows.length) {
    await db.query(
      "INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, $2, $3, $4, $5)",
      [req.session.user.id, type, id, reason, text(req.body.details, 1000)]
    );
  }
  res.status(201).json({ ok: true });
});

module.exports = router;
module.exports.KINDS = KINDS;
