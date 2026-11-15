// src/routes/premium.js
// Chapterhive Premium (queued). Everything here is behind the "premium" feature flag,
// so only the admin sees it until it's switched on for everyone.
//
//   GET  /api/premium                  plans, perks, page themes, my plan, waitlist status
//   POST /api/premium/waitlist         "tell me when it launches"
//   PUT  /api/premium/page-style       { theme, accent, wallpaper }  (Premium creators)
//   POST /api/premium/grant            { username, plan, days }       (admin: for testing or gifts)

const express = require("express");
const db = require("../db");
const storage = require("../storage");
const { requireLogin, requireAdmin } = require("../auth");
const { requireFlag } = require("../flags");
const { resolveMedia } = require("../media");
const { PLANS, PAGE_THEMES, planOf } = require("../plans");

const router = express.Router();
router.use(requireFlag("premium"));

router.get("/", async function (req, res) {
  let mine = null;
  let waiting = false;
  let waitlistCount;
  if (req.session.user) {
    const { rows } = await db.query("SELECT plan, plan_until, role FROM users WHERE id = $1", [req.session.user.id]);
    const p = planOf(rows[0]);
    mine = { plan: p.key, until: rows[0].plan === "premium" ? rows[0].plan_until : null };
    waiting = (await db.query("SELECT 1 FROM premium_waitlist WHERE user_id = $1", [req.session.user.id])).rows.length > 0;
    if (rows[0].role === "admin") waitlistCount = (await db.query("SELECT COUNT(*)::int AS n FROM premium_waitlist")).rows[0].n;
  }
  res.json({ plans: PLANS, themes: PAGE_THEMES, mine: mine, onWaitlist: waiting, waitlistCount: waitlistCount, launched: false });
});

router.post("/waitlist", requireLogin, async function (req, res) {
  await db.query("INSERT INTO premium_waitlist (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [req.session.user.id]);
  res.status(201).json({ ok: true });
});

router.put("/page-style", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    `SELECT u.plan, u.plan_until, u.role, cp.page_wallpaper_url, cp.page_wallpaper_public_id, cp.status
       FROM users u LEFT JOIN creator_profiles cp ON cp.user_id = u.id WHERE u.id = $1`, [req.session.user.id]);
  const row = rows[0];
  if (!row || !row.status) return res.status(403).json({ error: "Only creators have a creator page to style." });
  if (!planOf(row).customPage && row.role !== "admin") return res.status(403).json({ error: "Custom page styles come with Chapterhive Premium." });

  const theme = Object.prototype.hasOwnProperty.call(PAGE_THEMES, req.body.theme) ? req.body.theme : null;
  const accent = typeof req.body.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(req.body.accent) ? req.body.accent.toLowerCase() : null;
  let wallpaper = { url: row.page_wallpaper_url, publicId: row.page_wallpaper_public_id, changed: false };
  if (req.body.wallpaper === null) {
    wallpaper = { url: null, publicId: null, changed: true };
  } else if (req.body.wallpaper && !req.body.wallpaper.keep) {
    const result = resolveMedia([req.body.wallpaper], [], { roles: ["cover"], kinds: ["image"], max: 1 });
    if (result.problem) return res.status(400).json({ error: result.problem, problems: [{ field: "wallpaper", message: result.problem }] });
    wallpaper = { url: result.items[0].url, publicId: result.items[0].publicId, changed: true };
  }
  await db.query(
    "UPDATE creator_profiles SET page_theme = $1, page_accent = $2, page_wallpaper_url = $3, page_wallpaper_public_id = $4 WHERE user_id = $5",
    [theme, accent, wallpaper.url, wallpaper.publicId, req.session.user.id]);
  if (wallpaper.changed && row.page_wallpaper_public_id) await storage.deleteImage(row.page_wallpaper_public_id);
  res.json({ ok: true, style: { theme: theme, accent: accent, wallpaperUrl: storage.displayUrl(wallpaper.url, "image") || null } });
});

router.post("/grant", requireAdmin, async function (req, res) {
  const plan = req.body.plan === "premium" ? "premium" : "free";
  const days = Number(req.body.days);
  const until = plan === "premium" && Number.isInteger(days) && days > 0 ? new Date(Date.now() + days * 86400000) : null;
  const { rows } = await db.query("UPDATE users SET plan = $1, plan_until = $2 WHERE username = $3 RETURNING id",
    [plan, until, String(req.body.username || "").toLowerCase()]);
  if (!rows.length) return res.status(404).json({ error: "There's no member with that username." });
  res.json({ ok: true, plan: plan, until: until });
});

module.exports = router;
