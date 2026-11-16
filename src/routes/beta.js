// src/routes/beta.js
// Beta tester applications while Chapterhive is still pre-launch.
//
//   GET    /api/beta                     are applications open?
//   POST   /api/beta                     { username, email, displayName, birthDate, country, reason, acceptTerms }
//   Admin: GET /api/beta/admin · POST /api/beta/admin/:id/approve · POST /api/beta/admin/:id/decline
//
// Approving holds the username as a reservation marked "beta" and sends (or shows) a claim link.
// Claiming it makes an ordinary member account with is_beta set, so the tester can log in before launch.

const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const users = require("../users");
const signup = require("../signup");
const flags = require("../flags");
const { requireAdmin } = require("../auth");
const { mailEnabled, sendMail } = require("../mail");

const router = express.Router();
const EMAIL_PATTERN = /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: Number(process.env.SIGNUP_LIMIT_PER_HOUR) || 5, standardHeaders: "draft-8", legacyHeaders: false,
  skipFailedRequests: true, message: { error: "Too many applications from this connection. Please try again later." }
});

function escapeHtml(v) {
  return String(v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; });
}

router.get("/", async function (req, res) {
  res.json({ open: await flags.isOn("reservations", req) });
});

router.post("/", flags.requireFlag("reservations"), applyLimiter, async function (req, res) {
  const clean = function (v) { return typeof v === "string" ? v.trim() : ""; };
  let username = clean(req.body.username).toLowerCase().replace(/^@/, "");
  const email = clean(req.body.email).toLowerCase();
  const displayName = clean(req.body.displayName).slice(0, 60);
  const reason = clean(req.body.reason).slice(0, 1000);
  const birth = signup.checkBirthDate(req.body.birthDate);
  const country = signup.checkCountry(req.body.country);
  if (birth.tooYoung) return res.status(403).json({ error: birth.problem, tooYoung: true, problems: [{ field: "birthDate", message: birth.problem }] });

  const problems = [];
  let reservation = null;
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    problems.push({ field: "email", message: "Enter your email: that's where your invite will go." });
  } else if ((await db.query("SELECT 1 FROM beta_applications WHERE email = $1", [email])).rows.length) {
    problems.push({ field: "email", message: "This email has already applied. We'll be in touch." });
  } else if ((await db.query("SELECT 1 FROM users WHERE lower(email) = $1", [email])).rows.length) {
    problems.push({ field: "email", message: "This email already has an account." });
  } else {
    reservation = (await db.query("SELECT username FROM username_reservations WHERE email = $1 AND claimed_at IS NULL", [email])).rows[0] || null;
  }
  if (reservation) {
    username = reservation.username; // already reserved a name with this email: keep it
  } else {
    const issue = await users.usernameProblem(username);
    if (issue) problems.push({ field: "username", message: issue });
  }
  if (birth.problem) problems.push({ field: "birthDate", message: birth.problem });
  if (reason.length < 10) problems.push({ field: "reason", message: "Tell us a little about why you'd like to test (a sentence or two)." });
  if (req.body.acceptTerms !== true) problems.push({ field: "acceptTerms", message: "Please accept the Terms and Privacy Policy." });
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  try {
    await db.query("INSERT INTO beta_applications (username, email, display_name, country, reason) VALUES ($1, $2, $3, $4, $5)",
      [username, email, displayName || username, country, reason]);
  } catch (error) {
    if (error.code === "23505") return res.status(400).json({ error: "This email has already applied.", problems: [{ field: "email", message: "Already applied." }] });
    throw error;
  }
  res.status(201).json({ username: username, keptReservation: Boolean(reservation) });
});

/* ---------- Admin ---------- */

router.get("/admin", requireAdmin, async function (req, res) {
  const { rows } = await db.query("SELECT id, username, email, display_name, country, reason, status, created_at, decided_at FROM beta_applications ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 2000");
  res.json({ applications: rows, mailEnabled: mailEnabled() });
});

router.post("/admin/:id/approve", requireAdmin, async function (req, res) {
  const app = (await db.query("SELECT * FROM beta_applications WHERE id = $1", [Number(req.params.id)])).rows[0];
  if (!app) return res.status(404).json({ error: "Application not found." });
  if (app.status === "approved") return res.status(409).json({ error: "Already approved." });
  const base = (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");

  // They might already have an account by now: just make it a beta account.
  const existing = (await db.query("SELECT id FROM users WHERE lower(email) = $1", [app.email])).rows[0];
  let link = null;
  if (existing) {
    await db.query("UPDATE users SET is_beta = TRUE WHERE id = $1", [existing.id]);
  } else {
    let r = (await db.query("SELECT * FROM username_reservations WHERE email = $1", [app.email])).rows[0];
    if (!r) {
      const issue = await users.usernameProblem(app.username);
      if (issue) return res.status(409).json({ error: "@" + app.username + " isn't available any more (" + issue + "). Decline, or ask them to apply with another name." });
      r = (await db.query("INSERT INTO username_reservations (username, email, display_name, country, claim_token, beta) VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *",
        [app.username, app.email, app.display_name, app.country, crypto.randomBytes(24).toString("hex")])).rows[0];
    } else {
      await db.query("UPDATE username_reservations SET beta = TRUE WHERE id = $1", [r.id]);
    }
    link = base + "/hub/register?claim=" + r.claim_token;
  }
  await db.query("UPDATE beta_applications SET status = 'approved', decided_at = NOW() WHERE id = $1", [app.id]);

  let sent = false;
  if (mailEnabled()) {
    const text = existing
      ? "Hi " + app.display_name + ",\n\nYou're in! Your Chapterhive account is now a beta tester account, so you can log in before launch: " + base + "/hub/login"
      : "Hi " + app.display_name + ",\n\nYou're in! Set up your beta tester account for @" + app.username + " here:\n" + link + "\n\nYou'll be able to log in and use Chapterhive before launch.";
    const html = existing
      ? "<p>Hi " + escapeHtml(app.display_name) + ",</p><p>You're in! Your account is now a beta tester account. <a href=\"" + base + "/hub/login\">Log in</a></p>"
      : "<p>Hi " + escapeHtml(app.display_name) + ",</p><p>You're in! Set up your beta tester account for <strong>@" + escapeHtml(app.username) + "</strong>:</p><p><a href=\"" + link + "\">Create my beta account</a></p><p>See you in the hive! 🐝</p>";
    try { await sendMail(app.email, "You're a Chapterhive beta tester 🧪", text, html); sent = true; } catch (e) { sent = false; }
  }
  res.json({ ok: true, sent: sent, link: sent ? null : link, existingAccount: Boolean(existing) });
});

router.post("/admin/:id/decline", requireAdmin, async function (req, res) {
  const { rows } = await db.query("UPDATE beta_applications SET status = 'declined', decided_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id", [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: "No pending application with that id." });
  res.json({ ok: true });
});

module.exports = router;
