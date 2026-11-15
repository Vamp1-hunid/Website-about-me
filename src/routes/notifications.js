// src/routes/notifications.js  -  the notification bell
//   GET  /api/notifications            your notifications + admin announcements, newest first
//   GET  /api/notifications/count      how many are unread (for the red badge)
//   POST /api/notifications/read       mark everything (or { ids }) as read
//   GET  /api/notifications/trending   the most liked and discussed posts this week

const express = require("express");
const db = require("../db");
const storage = require("../storage");
const { requireLogin } = require("../auth");
const { VISIBLE, SELECT_POST, toPost } = require("./posts");

const router = express.Router();

async function announcementsFor(userId, sinceOnly) {
  const { rows } = await db.query(
    `SELECT a.*, (a.created_at > COALESCE(u.announcements_seen_at, '-infinity')) AS unread
       FROM announcements a, users u
      WHERE u.id = $1 AND a.created_at > u.created_at - INTERVAL '30 days'
        AND (a.audience = 'all' OR EXISTS (SELECT 1 FROM creator_profiles cp WHERE cp.user_id = u.id AND cp.status = 'approved') OR u.role = 'admin')
        ${sinceOnly ? "AND a.created_at > COALESCE(u.announcements_seen_at, '-infinity')" : ""}
      ORDER BY a.created_at DESC LIMIT 20`,
    [userId]
  );
  return rows;
}

router.get("/", requireLogin, async function (req, res) {
  const me = req.session.user.id;
  const mine = await db.query(
    "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40",
    [me]
  );
  const news = await announcementsFor(me, false);
  const items = mine.rows.map(function (n) {
    return { id: "n" + n.id, type: n.type, title: n.title, body: n.body, link: n.link, createdAt: n.created_at, unread: !n.read_at };
  }).concat(news.map(function (a) {
    return { id: "a" + a.id, type: "announcement", title: a.title, body: a.body, link: a.link, createdAt: a.created_at, unread: a.unread };
  })).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).slice(0, 50);
  res.json({ notifications: items });
});

router.get("/count", requireLogin, async function (req, res) {
  const me = req.session.user.id;
  const a = await db.query("SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL", [me]);
  const b = await announcementsFor(me, true);
  res.json({ count: a.rows[0].n + b.length });
});

router.post("/read", requireLogin, async function (req, res) {
  const me = req.session.user.id;
  const ids = req.body && Array.isArray(req.body.ids) ? req.body.ids : null;
  if (ids) {
    const numeric = ids.filter(function (x) { return /^n\d+$/.test(x); }).map(function (x) { return Number(x.slice(1)); });
    if (numeric.length) await db.query("UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = ANY ($2::int[]) AND read_at IS NULL", [me, numeric]);
    if (ids.some(function (x) { return /^a\d+$/.test(x); })) await db.query("UPDATE users SET announcements_seen_at = NOW() WHERE id = $1", [me]);
  } else {
    await db.query("UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL", [me]);
    await db.query("UPDATE users SET announcements_seen_at = NOW() WHERE id = $1", [me]);
  }
  res.json({ ok: true });
});

// Trending: likes count double, comments count once, over the last 7 days.
router.get("/trending", async function (req, res) {
  const { rows } = await db.query(
    `SELECT q.* FROM (${SELECT_POST} WHERE ${VISIBLE} AND p.category NOT IN ('news', 'updates')) q
      ORDER BY (
        (SELECT COUNT(*) FROM likes l WHERE l.post_id = q.id AND l.created_at > NOW() - INTERVAL '7 days') * 2 +
        (SELECT COUNT(*) FROM comments c WHERE c.post_id = q.id AND c.created_at > NOW() - INTERVAL '7 days')
      ) DESC, q.created_at DESC
      LIMIT 6`
  );
  res.json({ posts: rows.map(function (r) { return toPost(r, false); }) });
});

module.exports = router;
