// src/routes/chat.js
// One-to-one chat between members, with works (stories, art, videos) shared as cards.
//
// Safety rules, following common practice for platforms open to teenagers:
//  - both people must have a date of birth on their account;
//  - teen accounts (13-17) can only chat with other teen accounts, and adults only with adults;
//  - anyone can switch off new chats (chat_privacy = 'nobody'), block someone, or report a message;
//  - suspended or banned accounts can't chat.
//
//   GET    /api/chat/threads                    my conversations (newest first) + unread counts
//   GET    /api/chat/unread                     number of conversations with unread messages
//   POST   /api/chat/threads { username }       open (or find) a conversation with someone
//   GET    /api/chat/threads/:id?after=<msgId>  the messages (marks them read)
//   POST   /api/chat/threads/:id/messages { body, postSlug }
//   DELETE /api/chat/messages/:id               remove one of my own messages
//   POST   /api/chat/messages/:id/report { reason, details }
//   GET    /api/chat/blocks   POST /api/chat/blocks { username }   DELETE /api/chat/blocks/:username

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireLogin } = require("../auth");
const { requireFlag } = require("../flags");
const { avatarUrl, thumbnailUrl } = require("../storage");
const signup = require("../signup");
const { VISIBLE } = require("./posts");

const router = express.Router();
router.use(requireLogin, requireFlag("chat"));

const sendLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: function (req) { return "chat-" + req.session.user.id; },
  message: { error: "You're sending messages very fast. Take a short breather." }
});
const openLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false,
  keyGenerator: function (req) { return "chat-open-" + req.session.user.id; },
  message: { error: "You've started a lot of new chats. Please try again later." }
});

async function me(req) {
  const { rows } = await db.query("SELECT id, birth_date, status FROM users WHERE id = $1", [req.session.user.id]);
  return rows[0];
}

function band(user) {
  return signup.isMinor(user.birth_date) ? "teen" : "adult";
}

async function blockedEitherWay(a, b) {
  const { rows } = await db.query(
    "SELECT 1 FROM chat_blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)", [a, b]);
  return rows.length > 0;
}

// Can these two people chat? Returns an error message or null.
function chatProblem(self, other) {
  if (!self.birth_date) return { code: "needs-birth-date", error: "Add your date of birth in Account settings before using chat. It keeps teens and adults in separate spaces." };
  if (self.status !== "active") return { error: "Your account can't send messages right now." };
  if (!other || other.status !== "active") return { error: "That member can't receive messages." };
  if (!other.birth_date) return { error: "That member hasn't set up chat yet." };
  if (band(self) !== band(other)) {
    return { error: band(self) === "teen"
      ? "For your safety, teen accounts can only chat with other teen accounts."
      : "That member has a teen account. Adults and teen accounts can't chat." };
  }
  return null;
}

function pair(a, b) { return a < b ? [a, b] : [b, a]; }

function personOut(row, prefix) {
  return {
    username: row[prefix + "username"],
    displayName: row[prefix + "display_name"],
    avatarUrl: avatarUrl(row[prefix + "avatar_url"]) || null
  };
}

async function loadThread(id, userId) {
  const { rows } = await db.query("SELECT * FROM chat_threads WHERE id = $1 AND (user_a = $2 OR user_b = $2)", [id, userId]);
  return rows[0] || null;
}

function sharedOut(row) {
  if (!row.p_slug) return null;
  return {
    slug: row.p_slug, title: row.p_title, category: row.p_category,
    imageUrl: thumbnailUrl(row.p_image_url) || null, summary: row.p_logline || row.p_summary || "",
    hasVideo: Boolean(row.p_has_video), hasAudio: Boolean(row.p_has_audio), creator: row.p_creator || null
  };
}

const MESSAGE_SELECT = `
  SELECT m.*, u.username AS s_username, u.display_name AS s_display_name, u.avatar_url AS s_avatar_url,
    p.slug AS p_slug, p.title AS p_title, p.category AS p_category, p.image_url AS p_image_url,
    p.summary AS p_summary, p.logline AS p_logline, cp.handle AS p_creator,
    EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.kind = 'video') AS p_has_video,
    EXISTS (SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.kind = 'audio') AS p_has_audio
  FROM chat_messages m
  LEFT JOIN users u ON u.id = m.sender_id
  LEFT JOIN posts p ON p.id = m.post_id AND ${VISIBLE}
  LEFT JOIN creator_profiles cp ON cp.user_id = p.user_id`;

function messageOut(row, userId) {
  return {
    id: row.id,
    mine: row.sender_id === userId,
    sender: row.sender_id ? personOut(row, "s_") : null,
    body: row.deleted ? "" : row.body,
    deleted: row.deleted,
    shared: row.deleted ? null : sharedOut(row),
    createdAt: row.created_at
  };
}

/* ---------- Conversations ---------- */

router.get("/threads", async function (req, res) {
  const id = req.session.user.id;
  const { rows } = await db.query(
    `SELECT t.id, t.last_at,
        o.username AS o_username, o.display_name AS o_display_name, o.avatar_url AS o_avatar_url,
        (SELECT body FROM chat_messages m WHERE m.thread_id = t.id AND NOT m.deleted ORDER BY m.id DESC LIMIT 1) AS last_body,
        (SELECT post_id IS NOT NULL FROM chat_messages m WHERE m.thread_id = t.id AND NOT m.deleted ORDER BY m.id DESC LIMIT 1) AS last_shared,
        (SELECT COUNT(*) FROM chat_messages m WHERE m.thread_id = t.id AND m.sender_id <> $1 AND NOT m.deleted
           AND m.created_at > CASE WHEN t.user_a = $1 THEN t.a_read_at ELSE t.b_read_at END)::int AS unread,
        EXISTS (SELECT 1 FROM chat_messages m WHERE m.thread_id = t.id) AS has_messages
       FROM chat_threads t
       JOIN users o ON o.id = CASE WHEN t.user_a = $1 THEN t.user_b ELSE t.user_a END
      WHERE t.user_a = $1 OR t.user_b = $1
      ORDER BY t.last_at DESC LIMIT 100`,
    [id]
  );
  res.json({
    threads: rows.filter(function (r) { return r.has_messages; }).map(function (r) {
      return {
        id: r.id, with: personOut(r, "o_"), lastAt: r.last_at, unread: r.unread,
        preview: r.last_body ? r.last_body.slice(0, 90) : (r.last_shared ? "Shared a work" : "")
      };
    })
  });
});

router.get("/unread", async function (req, res) {
  const id = req.session.user.id;
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT t.id)::int AS n FROM chat_threads t JOIN chat_messages m ON m.thread_id = t.id
      WHERE (t.user_a = $1 OR t.user_b = $1) AND m.sender_id <> $1 AND NOT m.deleted
        AND m.created_at > CASE WHEN t.user_a = $1 THEN t.a_read_at ELSE t.b_read_at END`, [id]);
  res.json({ unread: rows[0].n });
});

router.post("/threads", openLimiter, async function (req, res) {
  const self = await me(req);
  const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase().replace(/^@/, "") : "";
  const { rows } = await db.query("SELECT id, username, birth_date, status, chat_privacy FROM users WHERE username = $1", [username]);
  const other = rows[0];
  if (!other) return res.status(404).json({ error: "There's no member with that username." });
  if (other.id === self.id) return res.status(400).json({ error: "You can't start a chat with yourself." });
  const problem = chatProblem(self, other);
  if (problem) return res.status(403).json(problem);
  if (await blockedEitherWay(self.id, other.id)) return res.status(403).json({ error: "You can't chat with this member." });
  const [a, b] = pair(self.id, other.id);
  const existing = await db.query("SELECT id FROM chat_threads WHERE user_a = $1 AND user_b = $2", [a, b]);
  if (existing.rows.length) return res.json({ id: existing.rows[0].id });
  if (other.chat_privacy === "nobody") return res.status(403).json({ error: "This member isn't accepting new chats." });
  const made = await db.query("INSERT INTO chat_threads (user_a, user_b) VALUES ($1, $2) ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a RETURNING id", [a, b]);
  res.status(201).json({ id: made.rows[0].id });
});

router.get("/threads/:id", async function (req, res) {
  const userId = req.session.user.id;
  const thread = await loadThread(Number(req.params.id), userId);
  if (!thread) return res.status(404).json({ error: "That conversation could not be found." });
  const after = Math.max(0, parseInt(req.query.after, 10) || 0);
  const { rows } = await db.query(
    MESSAGE_SELECT + " WHERE m.thread_id = $1 AND m.id > $2 ORDER BY m.id DESC LIMIT 200", [thread.id, after]);
  rows.reverse();
  await db.query("UPDATE chat_threads SET " + (thread.user_a === userId ? "a_read_at" : "b_read_at") + " = NOW() WHERE id = $1", [thread.id]);
  const otherId = thread.user_a === userId ? thread.user_b : thread.user_a;
  const o = await db.query("SELECT username, display_name, avatar_url FROM users WHERE id = $1", [otherId]);
  const blocked = await db.query("SELECT 1 FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = $2", [userId, otherId]);
  const theirRead = thread.user_a === userId ? thread.b_read_at : thread.a_read_at;
  res.json({
    id: thread.id,
    with: o.rows[0] ? { username: o.rows[0].username, displayName: o.rows[0].display_name, avatarUrl: avatarUrl(o.rows[0].avatar_url) || null } : null,
    blockedByMe: blocked.rows.length > 0,
    theirReadAt: theirRead,
    messages: rows.map(function (r) { return messageOut(r, userId); })
  });
});

router.post("/threads/:id/messages", sendLimiter, async function (req, res) {
  const self = await me(req);
  const thread = await loadThread(Number(req.params.id), self.id);
  if (!thread) return res.status(404).json({ error: "That conversation could not be found." });
  const otherId = thread.user_a === self.id ? thread.user_b : thread.user_a;
  const o = await db.query("SELECT id, birth_date, status FROM users WHERE id = $1", [otherId]);
  const problem = chatProblem(self, o.rows[0]);
  if (problem) return res.status(403).json(problem);
  if (await blockedEitherWay(self.id, otherId)) return res.status(403).json({ error: "You can't send messages in this chat." });

  const body = typeof req.body.body === "string" ? req.body.body.replace(/\r\n/g, "\n").trim() : "";
  if (body.length > 2000) return res.status(400).json({ error: "Messages can be up to 2000 characters." });
  let postId = null;
  if (req.body.postSlug) {
    const p = await db.query(`SELECT p.id FROM posts p LEFT JOIN users ou ON ou.id = p.user_id LEFT JOIN creator_profiles cp ON cp.user_id = p.user_id
      WHERE p.slug = $1 AND ${VISIBLE}`, [String(req.body.postSlug).slice(0, 120)]);
    if (!p.rows.length) return res.status(404).json({ error: "That work can't be shared." });
    postId = p.rows[0].id;
  }
  if (!body && !postId) return res.status(400).json({ error: "Write a message first." });

  const ins = await db.query("INSERT INTO chat_messages (thread_id, sender_id, body, post_id) VALUES ($1, $2, $3, $4) RETURNING id",
    [thread.id, self.id, body, postId]);
  await db.query("UPDATE chat_threads SET last_at = NOW(), " + (thread.user_a === self.id ? "a_read_at" : "b_read_at") + " = NOW() WHERE id = $1", [thread.id]);
  const { rows } = await db.query(MESSAGE_SELECT + " WHERE m.id = $1", [ins.rows[0].id]);
  res.status(201).json({ message: messageOut(rows[0], self.id) });
});

router.delete("/messages/:id", async function (req, res) {
  const { rows } = await db.query(
    "UPDATE chat_messages SET deleted = TRUE, body = '', post_id = NULL WHERE id = $1 AND sender_id = $2 RETURNING id",
    [Number(req.params.id), req.session.user.id]);
  if (!rows.length) return res.status(404).json({ error: "That message could not be found." });
  res.json({ ok: true });
});

const REASONS = ["harassment", "explicit", "hate", "spam", "scam", "self-harm", "other"];

router.post("/messages/:id/report", async function (req, res) {
  const userId = req.session.user.id;
  const id = Number(req.params.id);
  const { rows } = await db.query(
    `SELECT m.id FROM chat_messages m JOIN chat_threads t ON t.id = m.thread_id
      WHERE m.id = $1 AND (t.user_a = $2 OR t.user_b = $2) AND m.sender_id <> $2`, [id, userId]);
  if (!rows.length) return res.status(404).json({ error: "That message could not be found." });
  const reason = REASONS.includes(req.body.reason) ? req.body.reason : "other";
  const details = typeof req.body.details === "string" ? req.body.details.trim().slice(0, 1000) : "";
  const dup = await db.query("SELECT 1 FROM reports WHERE reporter_id = $1 AND target_type = 'message' AND target_id = $2 AND status = 'open'", [userId, id]);
  if (!dup.rows.length) {
    await db.query("INSERT INTO reports (reporter_id, target_type, target_id, reason, details) VALUES ($1, 'message', $2, $3, $4)",
      [userId, id, reason.slice(0, 30), details]);
  }
  res.status(201).json({ ok: true });
});

/* ---------- Blocking ---------- */

router.get("/blocks", async function (req, res) {
  const { rows } = await db.query(
    "SELECT u.username, u.display_name FROM chat_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1 ORDER BY b.created_at DESC",
    [req.session.user.id]);
  res.json({ blocks: rows.map(function (r) { return { username: r.username, displayName: r.display_name }; }) });
});

router.post("/blocks", async function (req, res) {
  const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const { rows } = await db.query("SELECT id FROM users WHERE username = $1", [username]);
  if (!rows.length) return res.status(404).json({ error: "There's no member with that username." });
  if (rows[0].id === req.session.user.id) return res.status(400).json({ error: "You can't block yourself." });
  await db.query("INSERT INTO chat_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.session.user.id, rows[0].id]);
  res.status(201).json({ ok: true });
});

router.delete("/blocks/:username", async function (req, res) {
  await db.query("DELETE FROM chat_blocks WHERE blocker_id = $1 AND blocked_id = (SELECT id FROM users WHERE username = $2)",
    [req.session.user.id, String(req.params.username).toLowerCase()]);
  res.json({ ok: true });
});

module.exports = router;
