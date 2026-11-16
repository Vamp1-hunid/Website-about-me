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
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const users = require("../users");
const signup = require("../signup");
const flags = require("../flags");
const { requireStaff } = require("../staff");
const requireAdmin = requireStaff("approve_beta");
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

// Is it open, and (for signed-in people) where do they stand?
router.get("/", async function (req, res) {
  const out = { open: await flags.isOn("beta_applications", req) };
  if (req.session && req.session.user) {
    const u = (await db.query("SELECT username, email, is_beta, role, birth_date FROM users WHERE id = $1", [req.session.user.id])).rows[0];
    const app = u && u.email ? (await db.query("SELECT status, created_at FROM beta_applications WHERE email = $1", [u.email.toLowerCase()])).rows[0] : null;
    out.me = { username: u.username, isBeta: u.is_beta || u.role === "admin", hasEmail: Boolean(u.email), hasBirthDate: Boolean(u.birth_date),
      application: app ? { status: app.status, appliedAt: app.created_at } : null };
  }
  res.json(out);
});

// Signed-in members apply in one step: their username, email and details come from their account.
router.post("/me", flags.requireFlag("beta_applications"), applyLimiter, async function (req, res) {
  if (!req.session || !req.session.user) return res.status(401).json({ error: "Log in first." });
  const u = (await db.query("SELECT id, username, email, display_name, country, birth_date, is_beta, role FROM users WHERE id = $1", [req.session.user.id])).rows[0];
  if (u.is_beta || u.role === "admin") return res.status(400).json({ error: "You're already a beta tester." });
  if (!u.email) return res.status(400).json({ error: "Add an email to your account first (Edit my profile), so we can tell you when you're approved.", needsEmail: true });
  if (!u.birth_date) return res.status(400).json({ error: "Add your date of birth in Edit my profile first.", needsBirthDate: true });
  const reason = (typeof req.body.reason === "string" ? req.body.reason.trim() : "").slice(0, 1000);
  if (reason.length < 10) return res.status(400).json({ error: "Tell us a little about why you'd like to test.", problems: [{ field: "reason", message: "A sentence or two, please." }] });
  const email = u.email.toLowerCase();
  const existing = (await db.query("SELECT id, status FROM beta_applications WHERE email = $1", [email])).rows[0];
  if (existing && existing.status === "pending") return res.status(400).json({ error: "You've already applied. We'll let you know soon." });
  if (existing) {
    // Declined before? They can apply again.
    await db.query("UPDATE beta_applications SET status = 'pending', reason = $1, username = $2, created_at = NOW(), decided_at = NULL WHERE id = $3", [reason, u.username, existing.id]);
  } else {
    await db.query("INSERT INTO beta_applications (username, email, display_name, country, reason) VALUES ($1, $2, $3, $4, $5)",
      [u.username, email, u.display_name || u.username, u.country, reason]);
  }
  require("../notify").notifyStaff("approve_beta", { type: "beta", title: "🧪 New beta tester application", body: "@" + u.username + " (" + (u.display_name || u.username) + ") wants to test Chapterhive.", link: "/hub/beta#beta-admin" }).catch(function () {});
  res.status(201).json({ username: u.username, account: true });
});

router.post("/", flags.requireFlag("beta_applications"), applyLimiter, async function (req, res) {
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
  } else {
    const acct = (await db.query("SELECT username, is_beta, role FROM users WHERE lower(email) = $1", [email])).rows[0];
    if (acct && (acct.is_beta || acct.role === "admin")) problems.push({ field: "email", message: "This account can already log in." });
    else if (acct) reservation = { username: acct.username };
  }
  if (!reservation && !problems.length) {
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
  // New applicants choose a password: their account (and username) is made right away.
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!reservation && password) {
    const pw = signup.passwordProblem(password, username);
    if (pw) problems.push({ field: "password", message: pw });
    if (!country) problems.push({ field: "country", message: "Choose the country you live in." });
  }
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  let position = null;
  let accountMade = false;
  if (!reservation) {
    // Hold the username straight away, so nobody else can take it while we review.
    try {
      if (password) {
        const hash = await bcrypt.hash(password, 12);
        const u = await db.query(
          `INSERT INTO users (username, display_name, password_hash, role, email, terms_accepted_at, terms_version, birth_date, country)
           VALUES ($1, $2, $3, 'member', $4, NOW(), $5, $6, $7) RETURNING id`,
          [username, displayName || username, hash, email, signup.TERMS_VERSION, birth.date, country]);
        await users.welcome(u.rows[0].id, "member");
        accountMade = true;
      }
      const ins = await db.query("INSERT INTO username_reservations (username, email, display_name, country, claim_token, claimed_at) VALUES ($1, $2, $3, $4, $5, " + (password ? "NOW()" : "NULL") + ") RETURNING id",
        [username, email, displayName || username, country, crypto.randomBytes(24).toString("hex")]);
      position = (await db.query("SELECT position FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY pinned DESC, created_at, id)::int AS position FROM username_reservations) t WHERE id = $1", [ins.rows[0].id])).rows[0].position;
    } catch (error) {
      if (error.code === "23505") return res.status(409).json({ error: "Someone just took that name. Try another.", problems: [{ field: "username", message: "Just taken. Try another." }] });
      throw error;
    }
  }

  try {
    await db.query("INSERT INTO beta_applications (username, email, display_name, country, reason) VALUES ($1, $2, $3, $4, $5)",
      [username, email, displayName || username, country, reason]);
  } catch (error) {
    if (error.code === "23505") return res.status(400).json({ error: "This email has already applied.", problems: [{ field: "email", message: "Already applied." }] });
    throw error;
  }
  require("../notify").notifyStaff("approve_beta", { type: "beta", title: "🧪 New beta tester application", body: "@" + username + " (" + (displayName || username) + ") wants to test Chapterhive.", link: "/hub/beta#beta-admin" }).catch(function () {});
  res.status(201).json({ username: username, keptReservation: Boolean(reservation), position: position, account: accountMade });
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
      const issue = await users.usernameProblem(app.username, null, undefined, { legacy: true });
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
