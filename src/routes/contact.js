// src/routes/contact.js
// The contact form: saves each message (the dashboard has an inbox) and emails it to
// CONTACT_EMAIL, with Reply-To set to the visitor so pressing Reply answers them directly.

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { mailEnabled, sendMail } = require("../mail");

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "You've sent a few messages already. Please wait an hour before sending another." }
});

const TOPICS = { general: "General enquiry", collaboration: "Collaboration", feedback: "Feedback on this site" };
const EMAIL_PATTERN = /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// POST /api/contact  { name, email, topic, message, website }
// "website" is a hidden field people never see: bots fill it in, so a filled one is quietly ignored.
router.post("/", contactLimiter, async function (req, res) {
  if (clean(req.body.website, 200)) return res.json({ ok: true });

  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 254);
  const topic = TOPICS[req.body.topic] || TOPICS.general;
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";

  const problems = [];
  if (!name) problems.push({ field: "name", message: "Please enter your name." });
  if (!EMAIL_PATTERN.test(email)) problems.push({ field: "email", message: "Please enter a valid email address." });
  if (!message) problems.push({ field: "message", message: "Please write a message." });
  if (message.length > 5000) problems.push({ field: "message", message: "Please keep your message under 5,000 characters." });
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  const saved = await db.query(
    "INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4) RETURNING id",
    [name, email, topic, message]
  );

  let emailed = false;
  const to = (process.env.CONTACT_EMAIL || "").trim();
  if (mailEnabled() && to) {
    try {
      const text = "New message from the God's Banditos contact form\n\n" +
        "From: " + name + " <" + email + ">\nTopic: " + topic + "\n\n" + message + "\n\n" +
        "(Press Reply to answer " + name + " directly.)\n";
      const escape = function (s) {
        return String(s).replace(/[&<>"']/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
      };
      const html = "<p><b>New message from the God's Banditos contact form</b></p>" +
        "<p>From: " + escape(name) + " &lt;" + escape(email) + "&gt;<br>Topic: " + escape(topic) + "</p>" +
        "<p style=\"white-space:pre-wrap\">" + escape(message) + "</p>" +
        "<p style=\"color:#777\">Press Reply to answer " + escape(name) + " directly.</p>";
      await sendMail(to, "[Contact] " + topic + " from " + name, text, html, { replyTo: { email: email, name: name } });
      emailed = true;
      await db.query("UPDATE contact_messages SET emailed = TRUE WHERE id = $1", [saved.rows[0].id]);
    } catch (error) {
      console.error("Contact email failed:", error.message);
    }
  }

  res.json({ ok: true, emailed: emailed });
});

module.exports = router;
