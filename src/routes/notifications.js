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
        AND (a.audience = 'all' OR u.role = 'admin'
             OR (a.audience = 'creators' AND EXISTS (SELECT 1 FROM creator_profiles cp WHERE cp.user_id = u.id AND cp.status = 'approved'))
             OR (a.audience = 'beta' AND u.is_beta)
             OR (a.audience = 'staff' AND cardinality(u.staff_perms) > 0))
        ${sinceOnly ? "AND a.created_at > COALESCE(u.announcements_seen_at, '-infinity')" : ""}
      ORDER BY a.created_at DESC LIMIT 20`,
    [userId]
  );
  return rows;
}

// GET /api/notifications/announcements -> team announcements for the News & updates page and the pop-up.
// Visitors see the ones for everyone; signed-in people also see the ones meant for them (beta testers, creators, staff).
router.get("/announcements", async function (req, res) {
  const me = req.session && req.session.user ? req.session.user.id : null;
  const { rows } = await db.query(
    `SELECT a.id, a.title, a.body, a.link, a.audience, a.created_at FROM announcements a
       LEFT JOIN users u ON u.id = $1
      WHERE a.created_at > NOW() - INTERVAL '90 days'
        AND (a.audience = 'all' OR u.role = 'admin'
             OR (a.audience = 'creators' AND EXISTS (SELECT 1 FROM creator_profiles cp WHERE cp.user_id = u.id AND cp.status = 'approved'))
             OR (a.audience = 'beta' AND u.is_beta)
             OR (a.audience = 'staff' AND cardinality(u.staff_perms) > 0))
      ORDER BY a.created_at DESC LIMIT 20`, [me]);
  res.json({ announcements: rows.map(function (a) {
    return { id: a.id, title: a.title, body: a.body, link: a.link, audience: a.audience, createdAt: a.created_at };
  }) });
});

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

// Phone notifications: the key the browser needs, and saving / removing this device.
router.get("/push-key", async function (req, res) {
  res.json({ publicKey: await require("../push").publicKey() });
});
router.post("/push-subscribe", requireLogin, async function (req, res) {
  const sub = req.body && req.body.subscription;
  const endpoint = sub && typeof sub.endpoint === "string" ? sub.endpoint : "";
  const k = (sub && sub.keys) || {};
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof k.p256dh !== "string" || typeof k.auth !== "string") {
    return res.status(400).json({ error: "That notification subscription doesn't look right." });
  }
  await db.query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [endpoint, req.session.user.id, k.p256dh.slice(0, 200), k.auth.slice(0, 100)]);
  res.status(201).json({ ok: true });
});
router.post("/push-unsubscribe", requireLogin, async function (req, res) {
  const endpoint = req.body && typeof req.body.endpoint === "string" ? req.body.endpoint : "";
  await db.query("DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2", [endpoint, req.session.user.id]);
  res.json({ ok: true });
});
router.post("/push-test", requireLogin, async function (req, res) {
  await require("../notify").notify(req.session.user.id, { type: "info", title: "🐝 Notifications are on", body: "This is how Chapterhive will tell you about new followers, buddy requests, chats and updates.", link: "/hub" });
  res.json({ ok: true });
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
