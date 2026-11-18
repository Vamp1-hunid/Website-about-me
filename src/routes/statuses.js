// src/routes/statuses.js
// Statuses: a creator's picture, short clip or text card that disappears after 24 hours (like WhatsApp Status or
// Instagram Stories). Only approved creators (and admins) post them; anyone logged in can watch.
//   GET    /api/statuses                 the bar: creators with live statuses (mine first, then unseen, people I follow)
//   GET    /api/statuses/u/:username     one creator's live statuses, oldest first
//   POST   /api/statuses                 post one { media | text+bg, caption, soundId, soundStart, audience, linkSlug }
//   POST   /api/statuses/:id/view        mark as seen
//   GET    /api/statuses/:id/viewers     who saw it (its creator only)
//   DELETE /api/statuses/:id             take it down early (its creator, or an admin)
// Expired statuses (and their files) are cleaned up every hour.

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const storage = require("../storage");
const { requireLogin, requireCreator } = require("../auth");
const { resolveMedia, cleanText } = require("../media");
const sounds = require("./sounds");

const router = express.Router();
router.use(requireLogin);

const BGS = ["honey", "night", "rose", "mint", "sky", "ink"];
const postLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: "That's a lot of statuses in one hour. Take a breather and try again later." } });

// Statuses this viewer may see: live, from active creators, the right audience, and not from someone who blocked them.
const CAN_SEE = `s.expires_at > NOW() AND u.status = 'active'
  AND (s.user_id = $1 OR s.audience = 'members' OR EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.creator_id = s.user_id))
  AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.blocker_id = s.user_id AND b.blocked_id = $1)`;

router.get("/", async function (req, res) {
  const me = req.session.user.id;
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, cp.handle, cp.name AS creator_name,
            COUNT(*)::int AS count, MAX(s.created_at) AS latest_at,
            BOOL_AND(s.user_id = $1 OR EXISTS (SELECT 1 FROM status_views v WHERE v.status_id = s.id AND v.user_id = $1)) AS all_seen,
            EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.creator_id = u.id) AS following
       FROM statuses s JOIN users u ON u.id = s.user_id LEFT JOIN creator_profiles cp ON cp.user_id = u.id
      WHERE ${CAN_SEE}
      GROUP BY u.id, cp.handle, cp.name
      ORDER BY (u.id = $1) DESC, all_seen ASC, following DESC, latest_at DESC
      LIMIT 60`, [me]);
  res.json({
    people: rows.map(function (r) {
      return { username: r.username, displayName: r.creator_name || r.display_name, handle: r.handle,
        avatarUrl: storage.avatarUrl(r.avatar_url) || null, count: r.count, latestAt: r.latest_at,
        allSeen: r.all_seen, isMe: r.id === me };
    })
  });
});

router.get("/u/:username", async function (req, res) {
  const me = req.session.user.id;
  const username = String(req.params.username || "").toLowerCase().replace(/^@/, "").slice(0, 40);
  const { rows } = await db.query(
    `SELECT s.*, u.username, u.display_name, u.avatar_url, cp.handle, cp.name AS creator_name, p.title AS link_title,
            ${sounds.SOUND_JSON("s")} AS sound,
            EXISTS (SELECT 1 FROM status_views v WHERE v.status_id = s.id AND v.user_id = $1) AS seen,
            (SELECT COUNT(*) FROM status_views v WHERE v.status_id = s.id)::int AS views
       FROM statuses s JOIN users u ON u.id = s.user_id LEFT JOIN creator_profiles cp ON cp.user_id = u.id
       LEFT JOIN posts p ON p.slug = s.link_slug
      WHERE u.username = $2 AND ${CAN_SEE}
      ORDER BY s.created_at ASC`, [me, username]);
  if (!rows.length) return res.status(404).json({ error: "No statuses to show right now." });
  const r0 = rows[0];
  res.json({
    person: { username: r0.username, displayName: r0.creator_name || r0.display_name, handle: r0.handle,
      avatarUrl: storage.avatarUrl(r0.avatar_url) || null, isMe: r0.user_id === me },
    statuses: rows.map(function (s) {
      return {
        id: s.id, kind: s.kind,
        url: s.media_url ? storage.displayUrl(s.media_url, s.kind) : null,
        text: s.text, bg: s.bg, caption: s.caption,
        link: s.link_slug && s.link_title ? { slug: s.link_slug, title: s.link_title } : null,
        sound: sounds.soundForClient(s.sound, s.sound_start),
        audience: s.audience, createdAt: s.created_at, expiresAt: s.expires_at, seen: s.seen,
        views: s.user_id === me ? s.views : undefined
      };
    })
  });
});

router.post("/", postLimiter, requireCreator, async function (req, res) {
  const me = req.session.user.id;
  const text = cleanText(req.body.text).slice(0, 300);
  const caption = cleanText(req.body.caption).slice(0, 300);
  const bg = BGS.includes(req.body.bg) ? req.body.bg : "honey";
  const audience = req.body.audience === "followers" ? "followers" : "members";
  let kind = "text", url = null, publicId = null;
  if (req.body.media) {
    const media = resolveMedia([req.body.media], [], { roles: ["page"], kinds: ["image", "video"], max: 1 });
    if (media.problem || !media.items.length) {
      return res.status(400).json({ error: media.problem ? "Statuses can be a picture or a short clip." : "Choose a picture or clip." });
    }
    kind = media.items[0].kind; url = media.items[0].url; publicId = media.items[0].publicId || null;
  } else if (!text) {
    return res.status(400).json({ error: "Add a picture, a clip or some text." });
  }
  let linkSlug = null;
  if (req.body.linkSlug) {
    const p = await db.query("SELECT slug FROM posts WHERE slug = $1 AND user_id = $2 AND published", [String(req.body.linkSlug).slice(0, 140), me]);
    linkSlug = p.rows.length ? p.rows[0].slug : null;
  }
  const soundId = await sounds.usableSound(req.body.soundId, me, req.isAdmin);
  const soundStart = Math.max(0, Math.min(3600, Number(req.body.soundStart) || 0));
  const { rows } = await db.query(
    `INSERT INTO statuses (user_id, kind, media_url, public_id, text, bg, caption, link_slug, sound_id, sound_start, audience)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, expires_at`,
    [me, kind, url, publicId, kind === "text" ? text : "", bg, caption, linkSlug,
      Number.isInteger(soundId) ? soundId : null, Number.isInteger(soundId) ? soundStart : 0, audience]);
  if (Number.isInteger(soundId)) await db.query("UPDATE sounds SET uses = uses + 1 WHERE id = $1", [soundId]);
  res.status(201).json({ id: rows[0].id, expiresAt: rows[0].expires_at });
});

router.post("/:id/view", async function (req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Not found." });
  await db.query(
    `INSERT INTO status_views (status_id, user_id)
     SELECT s.id, $1 FROM statuses s JOIN users u ON u.id = s.user_id WHERE s.id = $2 AND s.user_id <> $1 AND ${CAN_SEE}
     ON CONFLICT DO NOTHING`, [req.session.user.id, id]);
  res.json({ ok: true });
});

router.get("/:id/viewers", async function (req, res) {
  const id = Number(req.params.id);
  const own = await db.query("SELECT id FROM statuses WHERE id = $1 AND user_id = $2", [id, req.session.user.id]);
  if (!own.rows.length) return res.status(404).json({ error: "Only the person who posted it can see who viewed it." });
  const { rows } = await db.query(
    `SELECT u.username, u.display_name, u.avatar_url, v.viewed_at FROM status_views v JOIN users u ON u.id = v.user_id
      WHERE v.status_id = $1 ORDER BY v.viewed_at DESC LIMIT 500`, [id]);
  res.json({ viewers: rows.map(function (r) {
    return { username: r.username, displayName: r.display_name, avatarUrl: storage.avatarUrl(r.avatar_url) || null, viewedAt: r.viewed_at };
  }) });
});

router.delete("/:id", async function (req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Not found." });
  const { rows } = await db.query(
    "DELETE FROM statuses WHERE id = $1 AND (user_id = $2 OR $3) RETURNING public_id, kind",
    [id, req.session.user.id, req.session.user.role === "admin"]);
  if (!rows.length) return res.status(404).json({ error: "That status could not be found." });
  if (rows[0].public_id) storage.deleteMedia(rows[0].public_id, rows[0].kind).catch(function () {});
  res.json({ ok: true });
});

// Every hour: delete statuses that ran out, and their files.
async function cleanUp() {
  try {
    const { rows } = await db.query("DELETE FROM statuses WHERE expires_at < NOW() - INTERVAL '1 hour' RETURNING public_id, kind");
    for (const r of rows) if (r.public_id) await storage.deleteMedia(r.public_id, r.kind).catch(function () {});
  } catch (e) { console.error("Status clean-up failed:", e.message); }
}
setInterval(cleanUp, 60 * 60 * 1000).unref();
setTimeout(cleanUp, 30 * 1000).unref();

module.exports = router;
