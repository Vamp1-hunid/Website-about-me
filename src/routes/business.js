// src/routes/business.js
//   GET  /api/sponsor            the Sponsor page (pitch, numbers, tiers, business contact details)
//   POST /api/sponsor/enquiry    a business / investor enquiry -> admin inbox (+ email)
//   POST /api/suggestions        the suggestion box -> admin inbox

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireLogin } = require("../auth");
const { requireFlag } = require("../flags");
const { mailEnabled, sendMail } = require("../mail");
const { notifyMany } = require("../notify");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "You've sent a few messages already. Please wait an hour." }
});

const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

function text(v, max) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

const DEFAULT_SPONSOR = {
  headline: "Partner with Chapterhive",
  pitch: "Chapterhive is a growing home for independent creators: manga, art, animation, films, comedy and stories. " +
    "Brands, studios and investors can reach an engaged creative audience and help new talent grow.",
  showStats: true,
  tiers: [],
  contact: {}
};

async function readSponsor() {
  const { rows } = await db.query("SELECT value FROM app_settings WHERE key = 'sponsor'");
  try { return Object.assign({}, DEFAULT_SPONSOR, rows[0] ? JSON.parse(rows[0].value) : {}); } catch (e) { return Object.assign({}, DEFAULT_SPONSOR); }
}

async function tellAdmins(title, body) {
  const admins = await db.query("SELECT id FROM users WHERE role = 'admin'");
  await notifyMany(admins.rows.map(function (a) { return a.id; }), { type: "inbox", title: title, body: body.slice(0, 300), link: "/admin#inbox" });
}

function emailOwner(subject, textBody, replyTo) {
  const to = (process.env.CONTACT_EMAIL || "").trim();
  if (!mailEnabled() || !to) return Promise.resolve(false);
  const html = "<p style=\"white-space:pre-wrap\">" + textBody.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</p>";
  return sendMail(to, subject, textBody, html, replyTo ? { replyTo: replyTo } : {}).then(function () { return true; }, function (e) {
    console.error("Inbox email failed:", e.message);
    return false;
  });
}

router.get("/sponsor", requireFlag("sponsor_page"), async function (req, res) {
  const sponsor = await readSponsor();
  if (sponsor.showStats) {
    const { rows } = await db.query(
      `SELECT (SELECT COUNT(*) FROM creator_profiles WHERE status = 'approved')::int AS creators,
              (SELECT COUNT(*) FROM users WHERE status = 'active')::int AS members,
              (SELECT COUNT(*) FROM posts WHERE published AND review_status = 'approved')::int AS works,
              (SELECT COUNT(*) FROM follows)::int AS follows`
    );
    sponsor.stats = rows[0];
  }
  res.json({ sponsor: sponsor });
});

// POST /api/sponsor/enquiry { name, company, email, interest, message, website }
router.post("/sponsor/enquiry", requireFlag("sponsor_page"), limiter, async function (req, res) {
  if (text(req.body.website, 200)) return res.json({ ok: true }); // honeypot
  const name = text(req.body.name, 100);
  const company = text(req.body.company, 120);
  const email = text(req.body.email, 254);
  const interest = { sponsorship: "Sponsorship", advertising: "Advertising", investment: "Investment", partnership: "Partnership" }[req.body.interest] || "Business enquiry";
  const message = text(req.body.message, 5000);
  const problems = [];
  if (!name) problems.push({ field: "name", message: "Please enter your name." });
  if (!EMAIL.test(email)) problems.push({ field: "email", message: "Please enter a valid email address." });
  if (message.length < 10) problems.push({ field: "message", message: "Tell us a little about what you have in mind." });
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  const saved = await db.query(
    "INSERT INTO contact_messages (name, email, subject, message, kind, company, user_id) VALUES ($1, $2, $3, $4, 'business', $5, $6) RETURNING id",
    [name, email, interest, message, company, req.session.user ? req.session.user.id : null]
  );
  const emailed = await emailOwner("[" + interest + "] " + (company || name), "Business enquiry from Chapterhive\n\nFrom: " + name +
    (company ? " (" + company + ")" : "") + " <" + email + ">\nInterest: " + interest + "\n\n" + message + "\n", { email: email, name: name });
  if (emailed) await db.query("UPDATE contact_messages SET emailed = TRUE WHERE id = $1", [saved.rows[0].id]);
  await tellAdmins("💼 " + interest + " enquiry from " + (company || name), message);
  res.json({ ok: true });
});

// POST /api/suggestions { topic, message }
router.post("/suggestions", requireFlag("suggestion_box"), requireLogin, limiter, async function (req, res) {
  const topic = { feature: "Feature idea", bug: "Something's broken", content: "Content idea", other: "Other" }[req.body.topic] || "Suggestion";
  const message = text(req.body.message, 3000);
  if (message.length < 10) return res.status(400).json({ error: "Write your suggestion (at least 10 characters).", problems: [{ field: "message", message: "Write a little more." }] });
  const { rows } = await db.query("SELECT display_name, email, username FROM users WHERE id = $1", [req.session.user.id]);
  const u = rows[0];
  await db.query(
    "INSERT INTO contact_messages (name, email, subject, message, kind, user_id) VALUES ($1, $2, $3, $4, 'suggestion', $5)",
    [u.display_name + " (@" + u.username + ")", u.email || "", topic, message, req.session.user.id]
  );
  await tellAdmins("💡 Suggestion: " + topic, message);
  res.status(201).json({ ok: true });
});

module.exports = router;
module.exports.readSponsor = readSponsor;
