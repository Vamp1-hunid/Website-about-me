// src/routes/account.js
// Register, log in, log out, "who am I?", my favourites, and delete my account.

const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireLogin, startSession, publicUser } = require("../auth");
const { googleEnabled } = require("./google");
const crypto = require("crypto");
const { thumbnailUrl, upload, saveImage, deleteImage, avatarUrl } = require("../storage");
const { mailEnabled, sendMail } = require("../mail");

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
const EMAIL_PATTERN = /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

// A hash of a random password, checked when the username does not exist.
const DUMMY_HASH = bcrypt.hashSync(require("crypto").randomBytes(16).toString("hex"), 12);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// POST /api/account/register  { username, displayName, password }
router.post("/register", registerLimiter, async function (req, res) {
  const username = cleanText(req.body.username).toLowerCase();
  const displayName = cleanText(req.body.displayName) || username;
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const email = cleanText(req.body.email).toLowerCase();

  const problems = [];
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
    problems.push({ field: "email", message: "That email address doesn't look right (or leave it empty)." });
  }
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
    "INSERT INTO users (username, display_name, password_hash, role, email) VALUES ($1, $2, $3, 'member', $4) RETURNING *",
    [username, displayName, hash, email || null]
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
  const ok = await bcrypt.compare(password, user && user.password_hash ? user.password_hash : DUMMY_HASH);
  if (!ok) {
    const googleOnly = user && !user.password_hash && user.google_sub;
    return res.status(401).json({
      error: googleOnly
        ? "This account uses Google sign-in. Press \"Continue with Google\" instead."
        : "Wrong username or password."
    });
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
  res.json({ user: req.session.user || null, googleEnabled: googleEnabled(), mailEnabled: mailEnabled() });
});

// GET /api/account/favourites  -> the logged-in member's saved works
router.get("/favourites", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    `SELECT p.id, p.slug, p.category, p.title, p.summary, p.image_url, f.created_at AS saved_at
       FROM favourites f
       JOIN posts p ON p.id = f.post_id
      WHERE f.user_id = $1 AND (p.published AND (p.publish_at IS NULL OR p.publish_at <= NOW()))
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
       (SELECT created_at FROM users WHERE id = $1)              AS joined,
       (SELECT password_hash IS NOT NULL FROM users WHERE id = $1) AS "hasPassword",
       (SELECT google_sub IS NOT NULL FROM users WHERE id = $1)    AS "googleLinked",
       (SELECT email FROM users WHERE id = $1)                     AS email,
       (SELECT avatar_url FROM users WHERE id = $1)                AS "avatarUrl"`,
    [id]
  );
  rows[0].avatarUrl = avatarUrl(rows[0].avatarUrl) || null;
  rows[0].mailEnabled = mailEnabled();
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

  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  const hasPassword = Boolean(rows[0] && rows[0].password_hash);

  const problems = [];
  if (hasPassword && !currentPassword) {
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

  // Accounts made with Google have no password yet: they can set one without a current password.
  const ok = hasPassword ? await bcrypt.compare(currentPassword, rows[0].password_hash) : true;
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

// POST /api/account/google/unlink -> stop using Google sign-in (only if the account has a password)
router.post("/google/unlink", requireLogin, async function (req, res) {
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  if (!rows[0] || !rows[0].password_hash) {
    return res.status(400).json({ error: "Set a password first, otherwise you could not log in any more." });
  }
  await db.query("UPDATE users SET google_sub = NULL WHERE id = $1", [req.session.user.id]);
  res.json({ ok: true });
});

// DELETE /api/account  { password }  -> members can delete their own account and everything they posted
router.delete("/", requireLogin, async function (req, res) {
  if (req.session.user.role === "admin") {
    return res.status(400).json({ error: "The admin account cannot be deleted from the website." });
  }
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const { rows } = await db.query("SELECT username, password_hash FROM users WHERE id = $1", [req.session.user.id]);
  const user = rows[0];
  // Accounts without a password (Google sign-in) confirm by typing their username instead.
  const ok = !user ? false
    : user.password_hash ? await bcrypt.compare(password, user.password_hash)
    : password.trim().toLowerCase() === user.username;
  if (!ok) {
    return res.status(401).json({
      error: user && !user.password_hash ? "Type your username exactly to confirm." : "That password is not correct."
    });
  }
  await db.query("DELETE FROM users WHERE id = $1", [req.session.user.id]);
  req.session.destroy(function () {
    res.clearCookie("mm.sid");
    res.json({ ok: true });
  });
});

/* ---------- Email address (needed for "forgot password") ---------- */

// PUT /api/account/email  { email, currentPassword }  (empty email removes it)
router.put("/email", requireLogin, passwordLimiter, async function (req, res) {
  const email = cleanText(req.body.email).toLowerCase();
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
    return res.status(400).json({
      error: "That email address doesn't look right.",
      problems: [{ field: "email", message: "That email address doesn't look right." }]
    });
  }
  // Changing where reset links go is sensitive, so accounts with a password must confirm it.
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  if (rows[0] && rows[0].password_hash && !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    return res.status(401).json({
      error: "Your current password is not correct.",
      problems: [{ field: "emailPassword", message: "Enter your current password to change your email." }]
    });
  }
  await db.query("UPDATE users SET email = $1 WHERE id = $2", [email || null, req.session.user.id]);
  res.json({ email: email || null });
});

/* ---------- Profile picture ---------- */

// POST /api/account/avatar  (multipart "image", up to 8 MB)
router.post("/avatar", requireLogin, function (req, res, next) {
  upload.single("image")(req, res, async function (error) {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Pictures must be 8 MB or smaller." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a picture first." });
    try {
      const saved = await saveImage(req.file);
      const old = await db.query("SELECT avatar_public_id FROM users WHERE id = $1", [req.session.user.id]);
      const { rows } = await db.query(
        "UPDATE users SET avatar_url = $1, avatar_public_id = $2 WHERE id = $3 RETURNING *",
        [saved.url, saved.publicId, req.session.user.id]
      );
      if (old.rows[0] && old.rows[0].avatar_public_id) await deleteImage(old.rows[0].avatar_public_id);
      req.session.user = publicUser(rows[0]);
      res.json({ avatarUrl: req.session.user.avatarUrl });
    } catch (saveError) {
      if (/Cloudinary|valid image/.test(saveError.message || "")) {
        return res.status(400).json({ error: saveError.message });
      }
      next(saveError);
    }
  });
});

// DELETE /api/account/avatar
router.delete("/avatar", requireLogin, async function (req, res) {
  const old = await db.query("SELECT avatar_public_id FROM users WHERE id = $1", [req.session.user.id]);
  const { rows } = await db.query(
    "UPDATE users SET avatar_url = NULL, avatar_public_id = NULL WHERE id = $1 RETURNING *",
    [req.session.user.id]
  );
  if (old.rows[0] && old.rows[0].avatar_public_id) await deleteImage(old.rows[0].avatar_public_id);
  req.session.user = publicUser(rows[0]);
  res.json({ avatarUrl: null });
});

/* ---------- Forgot password ---------- */

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many reset requests. Please wait 15 minutes and try again." }
});

const RESET_MINUTES = 60;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function siteUrl(req) {
  return (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
}

// POST /api/account/forgot  { identifier }  (username or email)
// Always gives the same answer, so nobody can use it to find out which accounts exist.
router.post("/forgot", forgotLimiter, async function (req, res) {
  if (!mailEnabled()) {
    return res.status(503).json({
      error: "Password reset by email isn't switched on yet. Please contact the site owner through the contact form."
    });
  }
  const identifier = cleanText(req.body.identifier).toLowerCase();
  const answer = {
    ok: true,
    message: "If an account with that username or email has an email address saved, a reset link is on its way. " +
      "It works for " + RESET_MINUTES + " minutes. Check your spam folder too."
  };
  if (!identifier || identifier.length > 254) return res.json(answer);

  const { rows } = await db.query(
    "SELECT id, username, display_name, email FROM users WHERE email IS NOT NULL AND (username = $1 OR LOWER(email) = $1) LIMIT 3",
    [identifier]
  );

  for (const user of rows) {
    // At most 3 links per account per hour, so the form can't be used to flood someone's inbox.
    const recent = await db.query(
      "SELECT COUNT(*)::int AS n FROM password_resets WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'",
      [user.id]
    );
    if (recent.rows[0].n >= 3) continue;

    const token = crypto.randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)",
      [hashToken(token), user.id, String(RESET_MINUTES)]
    );
    const link = siteUrl(req) + "/reset?token=" + encodeURIComponent(token);
    const text =
      "Hi " + user.display_name + ",\n\n" +
      "Someone (hopefully you) asked to reset the password for @" + user.username + " on God's Banditos.\n\n" +
      "Choose a new password here (the link works for " + RESET_MINUTES + " minutes, once):\n" + link + "\n\n" +
      "If you didn't ask for this, ignore this email: your password stays the same.\n";
    const safeName = String(user.display_name).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
    const html =
      "<p>Hi " + safeName + ",</p>" +
      "<p>Someone (hopefully you) asked to reset the password for <b>@" + user.username + "</b> on God's Banditos.</p>" +
      "<p><a href=\"" + link + "\" style=\"background:#ff2e97;color:#0b0a10;padding:10px 18px;text-decoration:none;font-weight:bold\">Choose a new password</a></p>" +
      "<p>The link works for " + RESET_MINUTES + " minutes, once. If you didn't ask for this, ignore this email.</p>";
    try {
      await sendMail(user.email, "Reset your God's Banditos password", text, html);
    } catch (error) {
      console.error("Password reset email failed:", error.message);
    }
  }
  res.json(answer);
});

async function findValidReset(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const { rows } = await db.query(
    `SELECT r.user_id, u.username, u.role FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > NOW()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

// GET /api/account/reset?token=...  -> is this link still good?
router.get("/reset", forgotLimiter, async function (req, res) {
  const reset = await findValidReset(req.query.token);
  if (!reset) return res.status(400).json({ error: "This reset link has expired or was already used. Ask for a new one." });
  res.json({ ok: true, username: reset.username, minLength: reset.role === "admin" ? 10 : 8 });
});

// POST /api/account/reset  { token, password }
router.post("/reset", forgotLimiter, async function (req, res) {
  const reset = await findValidReset(req.body.token);
  if (!reset) return res.status(400).json({ error: "This reset link has expired or was already used. Ask for a new one." });
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const minLength = reset.role === "admin" ? 10 : 8;
  if (password.length < minLength || password.length > 200) {
    return res.status(400).json({
      error: "Please fix the highlighted fields.",
      problems: [{ field: "password", message: "The new password must be at least " + minLength + " characters." }]
    });
  }
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 12), reset.user_id]);
  // Every link for this account stops working, and every device is signed out.
  await db.query("UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [reset.user_id]);
  await db.query("DELETE FROM user_sessions WHERE (sess -> 'user' ->> 'id')::int = $1", [reset.user_id]);
  res.json({ ok: true, username: reset.username });
});

module.exports = router;
