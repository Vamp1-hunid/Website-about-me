// src/routes/account.js
// Register, log in, log out, "who am I?", my favourites, and delete my account.

const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireLogin, publicUser } = require("../auth");
const { thumbnailUrl } = require("../storage");

const router = express.Router();

// Slow down password guessing: at most 10 login attempts per 15 minutes per visitor.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many new accounts from this connection. Please try again later." }
});

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

// A hash of a random password, checked when the username does not exist.
const DUMMY_HASH = bcrypt.hashSync(require("crypto").randomBytes(16).toString("hex"), 12);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Logs a user in by saving them in the session.
// regenerate() gives the visitor a brand-new session id, which stops "session fixation" attacks.
function startSession(req, user) {
  return new Promise(function (resolve, reject) {
    req.session.regenerate(function (error) {
      if (error) return reject(error);
      req.session.user = publicUser(user);
      req.session.save(function (saveError) {
        if (saveError) return reject(saveError);
        resolve();
      });
    });
  });
}

// POST /api/account/register  { username, displayName, password }
router.post("/register", registerLimiter, async function (req, res) {
  const username = cleanText(req.body.username).toLowerCase();
  const displayName = cleanText(req.body.displayName) || username;
  const password = typeof req.body.password === "string" ? req.body.password : "";

  const problems = [];
  if (!USERNAME_PATTERN.test(username)) {
    problems.push({ field: "username", message: "Use 3 to 30 characters: lowercase letters, numbers or _." });
  }
  if (displayName.length > 60) {
    problems.push({ field: "displayName", message: "Display name must be 60 characters or fewer." });
  }
  if (password.length < 8 || password.length > 200) {
    problems.push({ field: "password", message: "Password must be at least 8 characters." });
  }
  if (problems.length) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }

  const taken = await db.query("SELECT 1 FROM users WHERE username = $1", [username]);
  if (taken.rows.length) {
    return res.status(409).json({
      error: "That username is taken.",
      problems: [{ field: "username", message: "That username is taken. Try another." }]
    });
  }

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    "INSERT INTO users (username, display_name, password_hash, role) VALUES ($1, $2, $3, 'member') RETURNING *",
    [username, displayName, hash]
  );

  await startSession(req, rows[0]);
  res.status(201).json({ user: req.session.user });
});

// POST /api/account/login  { username, password }
router.post("/login", loginLimiter, async function (req, res) {
  const username = cleanText(req.body.username).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";

  const { rows } = await db.query("SELECT * FROM users WHERE username = $1", [username]);
  const user = rows[0];

  // Same message (and roughly the same time) whether the username or the password
  // is wrong, so nobody can use the form to find out which usernames exist.
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!ok) {
    return res.status(401).json({ error: "Wrong username or password." });
  }

  await startSession(req, user);
  res.json({ user: req.session.user });
});

// POST /api/account/logout
router.post("/logout", function (req, res) {
  req.session.destroy(function () {
    res.clearCookie("mm.sid");
    res.json({ ok: true });
  });
});

// GET /api/account/me  -> { user } or { user: null }
router.get("/me", function (req, res) {
  res.json({ user: req.session.user || null });
});

// GET /api/account/favourites  -> the logged-in member's saved works
router.get("/favourites", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    `SELECT p.id, p.slug, p.category, p.title, p.summary, p.image_url, f.created_at AS saved_at
       FROM favourites f
       JOIN posts p ON p.id = f.post_id
      WHERE f.user_id = $1 AND p.published = TRUE
      ORDER BY f.created_at DESC`,
    [req.session.user.id]
  );
  res.json({
    favourites: rows.map(function (row) {
      return {
        id: row.id,
        slug: row.slug,
        category: row.category,
        title: row.title,
        summary: row.summary,
        imageUrl: thumbnailUrl(row.image_url),
        savedAt: row.saved_at
      };
    })
  });
});

// GET /api/account/stats  -> numbers for the profile page
router.get("/stats", requireLogin, async function (req, res) {
  const id = req.session.user.id;
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM comments WHERE user_id = $1)::int   AS comments,
       (SELECT COUNT(*) FROM likes WHERE user_id = $1)::int      AS likes,
       (SELECT COUNT(*) FROM favourites WHERE user_id = $1)::int AS favourites,
       (SELECT created_at FROM users WHERE id = $1)              AS joined`,
    [id]
  );
  res.json(rows[0]);
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." }
});

// POST /api/account/password  { currentPassword, newPassword }
// Works for members and for the admin. Signs out your other devices.
router.post("/password", requireLogin, passwordLimiter, async function (req, res) {
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  const isAdmin = req.session.user.role === "admin";
  const minLength = isAdmin ? 10 : 8;

  const problems = [];
  if (!currentPassword) {
    problems.push({ field: "currentPassword", message: "Enter your current password." });
  }
  if (newPassword.length < minLength || newPassword.length > 200) {
    problems.push({ field: "newPassword", message: "The new password must be at least " + minLength + " characters." });
  } else if (newPassword === currentPassword) {
    problems.push({ field: "newPassword", message: "Choose a password different from your current one." });
  }
  if (problems.length) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }

  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  const ok = rows[0] ? await bcrypt.compare(currentPassword, rows[0].password_hash) : false;
  if (!ok) {
    return res.status(401).json({
      error: "Your current password is not correct.",
      problems: [{ field: "currentPassword", message: "That is not your current password." }]
    });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.session.user.id]);
  // Sign out every other device that was logged in to this account.
  await db.query(
    "DELETE FROM user_sessions WHERE sid <> $1 AND (sess -> 'user' ->> 'id')::int = $2",
    [req.sessionID, req.session.user.id]
  );
  res.json({ ok: true });
});

// DELETE /api/account  { password }  -> members can delete their own account and everything they posted
router.delete("/", requireLogin, async function (req, res) {
  if (req.session.user.role === "admin") {
    return res.status(400).json({ error: "The admin account cannot be deleted from the website." });
  }
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  const ok = rows[0] ? await bcrypt.compare(password, rows[0].password_hash) : false;
  if (!ok) {
    return res.status(401).json({ error: "That password is not correct." });
  }
  await db.query("DELETE FROM users WHERE id = $1", [req.session.user.id]);
  req.session.destroy(function () {
    res.clearCookie("mm.sid");
    res.json({ ok: true });
  });
});

module.exports = router;
