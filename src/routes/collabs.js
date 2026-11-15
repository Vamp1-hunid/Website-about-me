// src/routes/collabs.js
// Chapterhive collab board: creators post requests ("Writer looking for an artist") and others reply.
//   GET    /api/collabs/meta            the role and compensation lists for the drop-downs
//   GET    /api/collabs                 open requests (filter: role, comp, q)
//   GET    /api/collabs/mine            your own requests with reply counts (creators)
//   GET    /api/collabs/:id             one request (+ its replies if it's yours)
//   POST   /api/collabs                 post a request (approved creators)
//   PUT    /api/collabs/:id             edit your request
//   POST   /api/collabs/:id/status      open / close your request
//   DELETE /api/collabs/:id             delete your request (or the admin, for moderation)
//   POST   /api/collabs/:id/replies     "I'm interested" (any logged-in member)

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const storage = require("../storage");
const { requireLogin, requireCreator } = require("../auth");
const { mailEnabled, sendMail } = require("../mail");

const router = express.Router();

// The drop-down list. "other" lets the creator describe it in their own words.
const ROLES = [
  ["writer", "Writer / storyteller"],
  ["artist", "Artist / illustrator"],
  ["manga-artist", "Manga / comic artist"],
  ["character-designer", "Character designer"],
  ["background-artist", "Background artist"],
  ["colorist", "Colorist"],
  ["letterer", "Letterer"],
  ["storyboard-artist", "Storyboard artist"],
  ["animator", "Animator"],
  ["voice-actor", "Voice actor"],
  ["composer", "Composer / sound designer"],
  ["video-editor", "Video editor"],
  ["editor", "Editor / proofreader"],
  ["translator", "Translator"],
  ["other", "Other (describe it)"]
];
const ROLE_KEYS = ROLES.map(function (r) { return r[0]; });
const COMPENSATION = [
  ["paid", "Paid"],
  ["revenue-share", "Revenue share"],
  ["unpaid", "Unpaid / passion project"],
  ["negotiable", "Open to discuss"]
];
const COMP_KEYS = COMPENSATION.map(function (c) { return c[0]; });

const postLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "You've posted a lot of requests. Please wait a while." }
});
const replyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "You've sent a lot of replies. Please wait a while." }
});

function text(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function roleLabel(key, other) {
  if (key === "other") return other || "Something else";
  const found = ROLES.find(function (r) { return r[0] === key; });
  return found ? found[1] : "";
}

router.param("id", function (req, res, next, value) {
  if (!/^\d{1,9}$/.test(value)) return res.status(404).json({ error: "That collab request could not be found." });
  next();
});

const COLLAB_SQL = `
  SELECT c.*, cp.handle, cp.name AS creator_name, cp.status AS creator_status, u.avatar_url,
         s.slug AS series_slug, s.title AS series_title,
         (SELECT COUNT(*) FROM collab_replies r WHERE r.collab_id = c.id)::int AS replies
    FROM collab_posts c
    JOIN users u ON u.id = c.user_id
    JOIN creator_profiles cp ON cp.user_id = c.user_id
    LEFT JOIN series s ON s.id = c.series_id`;

function toCollab(row, viewerId) {
  const mine = Boolean(viewerId && viewerId === row.user_id);
  return {
    id: row.id,
    title: row.title,
    lookingFor: { key: row.looking_for, label: roleLabel(row.looking_for, row.looking_for_other) },
    offering: row.offering ? { key: row.offering, label: roleLabel(row.offering, row.offering_other) } : null,
    lookingForOther: row.looking_for_other,
    offeringOther: row.offering_other,
    compensation: { key: row.compensation, label: (COMPENSATION.find(function (c) { return c[0] === row.compensation; }) || [, ""])[1] },
    description: row.description,
    series: row.series_id ? { id: row.series_id, slug: row.series_slug, title: row.series_title } : null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    creator: { handle: row.handle, name: row.creator_name, avatarUrl: storage.avatarUrl(row.avatar_url) || null },
    isMine: mine,
    replies: mine ? row.replies : undefined
  };
}

router.get("/meta", requireLogin, function (req, res) {
  res.json({
    roles: ROLES.map(function (r) { return { key: r[0], label: r[1] }; }),
    compensation: COMPENSATION.map(function (c) { return { key: c[0], label: c[1] }; })
  });
});

// GET /api/collabs?role=artist&comp=paid&q=&creator=&page=
router.get("/", requireLogin, async function (req, res) {
  const page = Math.min(1000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const size = 20;
  const where = ["c.status = 'open'", "cp.status = 'approved'"];
  const values = [];
  if (ROLE_KEYS.includes(req.query.role)) {
    values.push(req.query.role);
    where.push("c.looking_for = $" + values.length);
  }
  if (COMP_KEYS.includes(req.query.comp)) {
    values.push(req.query.comp);
    where.push("c.compensation = $" + values.length);
  }
  if (typeof req.query.creator === "string" && req.query.creator) {
    values.push(req.query.creator.toLowerCase().slice(0, 30));
    where.push("cp.handle = $" + values.length);
  }
  const q = text(req.query.q, 60);
  if (q) {
    values.push("%" + q.replace(/[\\%_]/g, "\\$&") + "%");
    const n = "$" + values.length;
    where.push(`(c.title ILIKE ${n} OR c.description ILIKE ${n} OR c.looking_for_other ILIKE ${n} OR cp.name ILIKE ${n})`);
  }
  const whereSql = " WHERE " + where.join(" AND ");
  const total = await db.query(
    "SELECT COUNT(*)::int AS n FROM collab_posts c JOIN creator_profiles cp ON cp.user_id = c.user_id" + whereSql,
    values
  );
  values.push(size, (page - 1) * size);
  const { rows } = await db.query(
    COLLAB_SQL + whereSql + ` ORDER BY c.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  const viewer = req.session.user ? req.session.user.id : null;
  res.json({
    collabs: rows.map(function (r) { return toCollab(r, viewer); }),
    page: page,
    pages: Math.max(1, Math.ceil(total.rows[0].n / size)),
    total: total.rows[0].n
  });
});

router.get("/mine", requireCreator, async function (req, res) {
  const { rows } = await db.query(COLLAB_SQL + " WHERE c.user_id = $1 ORDER BY c.status, c.created_at DESC", [req.session.user.id]);
  res.json({ collabs: rows.map(function (r) { return toCollab(r, req.session.user.id); }) });
});

router.get("/:id", requireLogin, async function (req, res) {
  const { rows } = await db.query(COLLAB_SQL + " WHERE c.id = $1", [Number(req.params.id)]);
  const row = rows[0];
  const viewer = req.session.user;
  const viewerId = viewer ? viewer.id : null;
  const mine = Boolean(row && viewerId === row.user_id);
  const isAdmin = Boolean(viewer && viewer.role === "admin");
  if (!row || ((row.status !== "open" || row.creator_status !== "approved") && !mine && !isAdmin)) {
    return res.status(404).json({ error: "That collab request could not be found, or it was closed." });
  }
  const collab = toCollab(row, viewerId);
  if (viewerId && !mine) {
    const r = await db.query("SELECT message, created_at FROM collab_replies WHERE collab_id = $1 AND user_id = $2", [row.id, viewerId]);
    collab.myReply = r.rows[0] ? { message: r.rows[0].message, createdAt: r.rows[0].created_at } : null;
  }
  if (mine) {
    const r = await db.query(
      `SELECT r.id, r.message, r.created_at, u.username, u.display_name, u.avatar_url, cp.handle, cp.status AS creator_status
         FROM collab_replies r JOIN users u ON u.id = r.user_id
         LEFT JOIN creator_profiles cp ON cp.user_id = r.user_id
        WHERE r.collab_id = $1 ORDER BY r.created_at DESC`,
      [row.id]
    );
    collab.replyList = r.rows.map(function (x) {
      return {
        id: x.id, message: x.message, createdAt: x.created_at,
        from: {
          username: x.username, displayName: x.display_name, avatarUrl: storage.avatarUrl(x.avatar_url) || null,
          creatorHandle: x.creator_status === "approved" ? x.handle : null
        }
      };
    });
  }
  res.json({ collab: collab });
});

async function validate(body, userId) {
  const v = {
    title: text(body.title, 120),
    lookingFor: ROLE_KEYS.includes(body.lookingFor) ? body.lookingFor : "",
    lookingForOther: text(body.lookingForOther, 80),
    offering: ROLE_KEYS.includes(body.offering) ? body.offering : "",
    offeringOther: text(body.offeringOther, 80),
    compensation: COMP_KEYS.includes(body.compensation) ? body.compensation : "negotiable",
    description: typeof body.description === "string" ? body.description.replace(/\r\n/g, "\n").trim().slice(0, 4000) : "",
    seriesId: body.seriesId ? Number(body.seriesId) : null
  };
  const problems = [];
  if (!v.title) problems.push({ field: "title", message: "Give your request a short title." });
  if (!v.lookingFor) problems.push({ field: "lookingFor", message: "Choose who you're looking for." });
  if (v.lookingFor === "other" && v.lookingForOther.length < 3) problems.push({ field: "lookingForOther", message: "Describe who you're looking for." });
  if (v.offering === "other" && v.offeringOther.length < 3) problems.push({ field: "offeringOther", message: "Describe what you bring." });
  if (v.lookingFor !== "other") v.lookingForOther = "";
  if (v.offering !== "other") v.offeringOther = "";
  if (v.description.length < 20) problems.push({ field: "description", message: "Describe the project in a few sentences (at least 20 characters)." });
  if (v.seriesId !== null) {
    const s = Number.isInteger(v.seriesId) ? await db.query("SELECT 1 FROM series WHERE id = $1 AND user_id = $2", [v.seriesId, userId]) : { rows: [] };
    if (!s.rows.length) problems.push({ field: "seriesId", message: "Choose one of your own stories (or none)." });
  }
  return { v: v, problems: problems };
}

router.post("/", requireCreator, postLimiter, async function (req, res) {
  const { v, problems } = await validate(req.body, req.session.user.id);
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  const { rows } = await db.query(
    `INSERT INTO collab_posts (user_id, title, looking_for, looking_for_other, offering, offering_other, compensation, description, series_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [req.session.user.id, v.title, v.lookingFor, v.lookingForOther, v.offering, v.offeringOther, v.compensation, v.description, v.seriesId]
  );
  const full = await db.query(COLLAB_SQL + " WHERE c.id = $1", [rows[0].id]);
  res.status(201).json({ collab: toCollab(full.rows[0], req.session.user.id) });
});

router.put("/:id", requireCreator, async function (req, res) {
  const own = await db.query("SELECT 1 FROM collab_posts WHERE id = $1 AND user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!own.rows.length) return res.status(404).json({ error: "That collab request could not be found." });
  const { v, problems } = await validate(req.body, req.session.user.id);
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  await db.query(
    `UPDATE collab_posts SET title = $1, looking_for = $2, looking_for_other = $3, offering = $4, offering_other = $5,
            compensation = $6, description = $7, series_id = $8, updated_at = NOW() WHERE id = $9`,
    [v.title, v.lookingFor, v.lookingForOther, v.offering, v.offeringOther, v.compensation, v.description, v.seriesId, Number(req.params.id)]
  );
  const full = await db.query(COLLAB_SQL + " WHERE c.id = $1", [Number(req.params.id)]);
  res.json({ collab: toCollab(full.rows[0], req.session.user.id) });
});

router.post("/:id/status", requireCreator, async function (req, res) {
  const status = req.body.status === "closed" ? "closed" : "open";
  const { rows } = await db.query(
    "UPDATE collab_posts SET status = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id",
    [status, Number(req.params.id), req.session.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "That collab request could not be found." });
  res.json({ status: status });
});

router.delete("/:id", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    "DELETE FROM collab_posts WHERE id = $1 AND (user_id = $2 OR $3) RETURNING id",
    [Number(req.params.id), req.session.user.id, req.session.user.role === "admin"]
  );
  if (!rows.length) return res.status(404).json({ error: "That collab request could not be found." });
  res.json({ ok: true });
});

// POST /api/collabs/:id/replies { message }
router.post("/:id/replies", requireLogin, replyLimiter, async function (req, res) {
  const message = text(req.body.message, 1500);
  if (message.length < 10) {
    return res.status(400).json({ error: "Write a short message (at least 10 characters).", problems: [{ field: "message", message: "Say who you are and how to reach you." }] });
  }
  const { rows } = await db.query(
    `SELECT c.id, c.user_id, c.title, u.email, u.display_name FROM collab_posts c
       JOIN users u ON u.id = c.user_id JOIN creator_profiles cp ON cp.user_id = c.user_id
      WHERE c.id = $1 AND c.status = 'open' AND cp.status = 'approved'`,
    [Number(req.params.id)]
  );
  const collab = rows[0];
  if (!collab) return res.status(404).json({ error: "That collab request could not be found, or it was closed." });
  if (collab.user_id === req.session.user.id) return res.status(400).json({ error: "That's your own request." });

  const inserted = await db.query(
    `INSERT INTO collab_replies (collab_id, user_id, message) VALUES ($1, $2, $3)
     ON CONFLICT (collab_id, user_id) DO UPDATE SET message = EXCLUDED.message, created_at = NOW()
     RETURNING (xmax = 0) AS is_new`,
    [collab.id, req.session.user.id, message]
  );

  // Let the poster know (only for a first reply, and only if email is set up and they gave one).
  if (inserted.rows[0].is_new && collab.email && mailEnabled()) {
    const site = (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
    const who = req.session.user.displayName + " (@" + req.session.user.username + ")";
    const body = "Hi " + collab.display_name + ",\n\n" + who + " replied to your Chapterhive collab request \"" + collab.title + "\":\n\n" +
      message + "\n\nSee all replies in your studio: " + site + "/hub/studio#collabs\n";
    sendMail(collab.email, "New reply to your collab request: " + collab.title, body,
      "<p>" + body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") + "</p>")
      .catch(function (error) { console.error("Collab reply email failed:", error.message); });
  }
  res.status(201).json({ ok: true, updated: !inserted.rows[0].is_new });
});

module.exports = router;
module.exports.ROLES = ROLES;
