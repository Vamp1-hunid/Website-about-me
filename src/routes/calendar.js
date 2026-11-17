// src/routes/calendar.js
//   GET    /api/calendar?year=2026      holidays (Zambian + international) and site events for a year
//   GET    /api/calendar/today          what's on today (used for the holiday banner and theme)
//   POST   /api/calendar/events         (admin) { title, startsOn, endsOn, details, link, emoji }
//   DELETE /api/calendar/events/:id     (admin)
//   GET    /api/calendar/verse          today's Bible verse reference
//   PUT    /api/calendar/verse          (admin) { reference, theme, text }: override today's verse

const express = require("express");
const db = require("../db");
const { requireAdmin } = require("../auth");
const { holidays } = require("../calendar");
const verses = require("../verses");

const router = express.Router();

function eventOut(r) {
  return { id: r.id, title: r.title, date: r.starts_on.toISOString().slice(0, 10), endDate: r.ends_on ? r.ends_on.toISOString().slice(0, 10) : null,
    details: r.details, link: r.link, emoji: r.emoji, kind: "event" };
}

router.get("/", async function (req, res) {
  const year = Math.min(2100, Math.max(2000, parseInt(req.query.year, 10) || new Date().getUTCFullYear()));
  const ev = await db.query("SELECT * FROM calendar_events WHERE starts_on <= $2 AND COALESCE(ends_on, starts_on) >= $1 ORDER BY starts_on",
    [year + "-01-01", year + "-12-31"]);
  res.json({ year: year, holidays: holidays(year), events: ev.rows.map(eventOut) });
});

// "Today" follows Zambian time (UTC+2), so holidays switch over at local midnight.
function zambiaNow() { return new Date(Date.now() + 2 * 3600000); }

router.get("/today", async function (req, res) {
  const now = zambiaNow();
  const today = now.toISOString().slice(0, 10);
  const todays = holidays(now.getUTCFullYear()).filter(function (h) { return h.date === today; });
  const ev = await db.query("SELECT * FROM calendar_events WHERE starts_on <= $1 AND COALESCE(ends_on, starts_on) >= $1", [today]);
  const theme = (todays.find(function (h) { return h.theme; }) || {}).theme || null;
  res.json({ date: today, holidays: todays, events: ev.rows.map(eventOut), theme: theme });
});

router.post("/events", requireAdmin, async function (req, res) {
  const title = typeof req.body.title === "string" ? req.body.title.trim().slice(0, 100) : "";
  const starts = /^\d{4}-\d{2}-\d{2}$/.test(req.body.startsOn) ? req.body.startsOn : null;
  const ends = /^\d{4}-\d{2}-\d{2}$/.test(req.body.endsOn) ? req.body.endsOn : null;
  if (!title || !starts) return res.status(400).json({ error: "Give the event a title and a start date." });
  if (ends && ends < starts) return res.status(400).json({ error: "The end date is before the start date." });
  const link = typeof req.body.link === "string" && /^(https:\/\/|\/)/.test(req.body.link.trim()) ? req.body.link.trim().slice(0, 300) : "";
  const { rows } = await db.query(
    "INSERT INTO calendar_events (title, starts_on, ends_on, details, link, emoji) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [title, starts, ends, String(req.body.details || "").slice(0, 500), link, String(req.body.emoji || "📅").slice(0, 8)]);
  res.status(201).json({ event: eventOut(rows[0]) });
});

router.delete("/events/:id", requireAdmin, async function (req, res) {
  await db.query("DELETE FROM calendar_events WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

router.get("/verse", async function (req, res) {
  res.json({ verse: await verses.today() });
});

router.put("/verse", requireAdmin, async function (req, res) {
  const reference = typeof req.body.reference === "string" ? req.body.reference.trim().slice(0, 60) : "";
  if (!reference) return res.status(400).json({ error: "Enter a reference like John 3:16." });
  const value = JSON.stringify({ date: zambiaNow().toISOString().slice(0, 10), reference: reference,
    theme: String(req.body.theme || "").slice(0, 80), text: String(req.body.text || "").slice(0, 600),
    devotion: String(req.body.devotion || "").slice(0, 1500), encouragement: String(req.body.encouragement || "").slice(0, 300),
    prayer: String(req.body.prayer || "").slice(0, 1000) });
  await db.query("INSERT INTO app_settings (key, value) VALUES ('verse_override', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [value]);
  res.json({ verse: await verses.today() });
});

module.exports = router;
