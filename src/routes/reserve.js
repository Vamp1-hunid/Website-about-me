// src/routes/reserve.js
// Pre-launch username reservations ("reserve your name before anyone else").
//
//   GET    /api/reserve                 is the campaign open, how many names are reserved, launch time
//   GET    /api/reserve/check?u=name    is this name free to reserve?
//   POST   /api/reserve                 { username, email, displayName, birthDate, country, acceptTerms }
//   GET    /api/reserve/claim?token=    the reservation behind a claim link (for the Join page)
//   Admin: GET /api/reserve/admin · POST /api/reserve/admin/invite · DELETE /api/reserve/admin/:id

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const users = require("../users");
const signup = require("../signup");
const flags = require("../flags");
const { requireAdmin } = require("../auth");
const { mailEnabled, sendMail } = require("../mail");

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

const reserveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: Number(process.env.SIGNUP_LIMIT_PER_HOUR) || 5, standardHeaders: "draft-8", legacyHeaders: false,
  skipFailedRequests: true, message: { error: "Too many reservations from this connection. Please try again later." }
});

async function launchAt() {
  const rows = await flags.all();
  const s = rows.find(function (f) { return f.key === "signups"; });
  return s && s.launch_at ? s.launch_at : null;
}

router.get("/", async function (req, res) {
  const count = (await db.query("SELECT COUNT(*)::int AS n FROM username_reservations")).rows[0].n;
  res.json({ open: await flags.isOn("reservations", req), count: count, launchAt: await launchAt() });
});

router.get("/check", async function (req, res) {
  const problem = await users.usernameProblem(typeof req.query.u === "string" ? req.query.u : "");
  res.json({ available: !problem, message: problem || "That name is free. Reserve it before someone else does!" });
});

router.post("/", flags.requireFlag("reservations"), reserveLimiter, async function (req, res) {
  const clean = function (v) { return typeof v === "string" ? v.trim() : ""; };
  const username = clean(req.body.username).toLowerCase().replace(/^@/, "");
  const email = clean(req.body.email).toLowerCase();
  const displayName = clean(req.body.displayName).slice(0, 60);
  const birth = signup.checkBirthDate(req.body.birthDate);
  const country = signup.checkCountry(req.body.country);
  if (birth.tooYoung) return res.status(403).json({ error: birth.problem, tooYoung: true, problems: [{ field: "birthDate", message: birth.problem }] });
  const problems = [];
  const issue = await users.usernameProblem(username);
  if (issue) problems.push({ field: "username", message: issue });
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) problems.push({ field: "email", message: "Enter your email: that's where your claim link will go." });
  else if ((await db.query("SELECT 1 FROM username_reservations WHERE email = $1", [email])).rows.length) {
    problems.push({ field: "email", message: "This email has already reserved a username. One per person." });
  } else if ((await db.query("SELECT 1 FROM users WHERE lower(email) = $1", [email])).rows.length) {
    problems.push({ field: "email", message: "This email already has an account. Just log in." });
  }
  if (birth.problem) problems.push({ field: "birthDate", message: birth.problem });
  if (req.body.acceptTerms !== true) problems.push({ field: "acceptTerms", message: "Please accept the Terms and Privacy Policy." });
  // With a password, the reservation is a real account straight away: it just can't log in until launch.
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (password) {
    const pw = signup.passwordProblem(password, username);
    if (pw) problems.push({ field: "password", message: pw });
    if (!country) problems.push({ field: "country", message: "Choose the country you live in." });
  }
  if (problems.length) {
    const taken = problems.length === 1 && problems[0].field === "username";
    return res.status(taken ? 409 : 400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }
  // The date of birth is only checked (13+), not stored: it's asked again when the account is claimed.
  const token = crypto.randomBytes(24).toString("hex");
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      const u = await db.query(
        `INSERT INTO users (username, display_name, password_hash, role, email, terms_accepted_at, terms_version, birth_date, country)
         VALUES ($1, $2, $3, 'member', $4, NOW(), $5, $6, $7) RETURNING id`,
        [username, displayName || username, hash, email, signup.TERMS_VERSION, birth.date, country]);
      await users.welcome(u.rows[0].id, "member");
    }
    await db.query("INSERT INTO username_reservations (username, email, display_name, country, claim_token, claimed_at) VALUES ($1, $2, $3, $4, $5, " + (password ? "NOW()" : "NULL") + ")",
      [username, email, displayName || username, country, token]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Someone just reserved that name. Try another.", problems: [{ field: "username", message: "Just taken. Try another." }] });
    throw error;
  }
  if (mailEnabled()) {
    sendMail(email, "@" + username + " is reserved for you on Chapterhive",
      "Hi " + (displayName || username) + ",\n\nYour username @" + username + " is reserved" + (password ? " and your account is ready. When Chapterhive opens, just log in with your username and password." : ". When Chapterhive opens, we'll email you a link to claim it and set up your account.") + "\n\nSee you in the hive!",
      "<p>Hi " + escapeHtml(displayName || username) + ",</p><p>Your username <strong>@" + escapeHtml(username) + "</strong> is reserved. When Chapterhive opens, we'll email you a link to claim it and set up your account.</p><p>See you in the hive! 🐝</p>"
    ).catch(function () {});
  }
  const count = (await db.query("SELECT COUNT(*)::int AS n FROM username_reservations")).rows[0].n;
  res.status(201).json({ username: username, count: count, account: Boolean(password) });
});

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; });
}

router.get("/claim", async function (req, res) {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const { rows } = await db.query("SELECT username, email, display_name, country, claimed_at FROM username_reservations WHERE claim_token = $1", [token]);
  if (!rows.length) return res.status(404).json({ error: "That claim link isn't valid." });
  if (rows[0].claimed_at) return res.status(410).json({ error: "This username has already been claimed. Log in instead." });
  res.json({ username: rows[0].username, email: rows[0].email, displayName: rows[0].display_name, country: rows[0].country });
});

/* ---------- Admin ---------- */

router.get("/admin", requireAdmin, async function (req, res) {
  const { rows } = await db.query("SELECT id, username, email, display_name, country, created_at, invited_at, claimed_at FROM username_reservations ORDER BY created_at DESC LIMIT 5000");
  res.json({ reservations: rows, mailEnabled: mailEnabled() });
});

// Sends claim links to everyone not yet invited (or returns the links to send by hand when email isn't set up).
router.post("/admin/invite", requireAdmin, async function (req, res) {
  const base = (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
  const { rows } = await db.query("SELECT * FROM username_reservations WHERE claimed_at IS NULL AND invited_at IS NULL ORDER BY created_at");
  const links = [];
  let sent = 0;
  for (const r of rows) {
    const link = base + "/hub/register?claim=" + r.claim_token;
    links.push({ username: r.username, email: r.email, link: link });
    if (mailEnabled()) {
      try {
        await sendMail(r.email, "Chapterhive is open: claim @" + r.username,
          "Hi " + r.display_name + ",\n\nChapterhive is open! Claim your reserved username @" + r.username + " and set up your account here:\n" + link + "\n\nSee you in the hive!",
          "<p>Hi " + escapeHtml(r.display_name) + ",</p><p>Chapterhive is open! Claim your reserved username <strong>@" + escapeHtml(r.username) + "</strong>:</p><p><a href=\"" + link + "\">Claim my username</a></p><p>See you in the hive! 🐝</p>");
        sent += 1;
        await db.query("UPDATE username_reservations SET invited_at = NOW() WHERE id = $1", [r.id]);
      } catch (e) { /* keep going */ }
    }
  }
  res.json({ sent: sent, total: rows.length, mailEnabled: mailEnabled(), links: mailEnabled() ? [] : links });
});

router.delete("/admin/:id", requireAdmin, async function (req, res) {
  await db.query("DELETE FROM username_reservations WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

module.exports = router;
