// src/routes/app.js
// Counts installs of the Chapterhive app (the installable web app, and later the Play Store app,
// which opens the same site). Each installed device is counted once.
//   GET  /api/app/stats      -> { installs, milestone }
//   POST /api/app/installed  { deviceId, platform }

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");

const router = express.Router();
const MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

function milestoneFor(n) {
  let m = null;
  MILESTONES.forEach(function (x) { if (n >= x) m = x; });
  return m;
}

router.get("/stats", async function (req, res) {
  const n = (await db.query("SELECT COUNT(*)::int AS n FROM app_installs")).rows[0].n;
  res.json({ installs: n, milestone: milestoneFor(n) });
});

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });

router.post("/installed", limiter, async function (req, res) {
  const id = typeof req.body.deviceId === "string" ? req.body.deviceId : "";
  if (!/^[a-z0-9-]{16,40}$/i.test(id)) return res.status(400).json({ error: "Bad device id." });
  const platform = String(req.body.platform || "").slice(0, 20);
  const userId = req.session && req.session.user ? req.session.user.id : null;
  const ins = await db.query("INSERT INTO app_installs (device_id, platform, user_id) VALUES ($1, $2, $3) ON CONFLICT (device_id) DO NOTHING", [id, platform, userId]);
  const n = (await db.query("SELECT COUNT(*)::int AS n FROM app_installs")).rows[0].n;
  // Crossing a milestone? Tell the team in the bell.
  if (ins.rowCount && MILESTONES.includes(n)) {
    require("../notify").notifyAdmins({ type: "info", title: "🎉 Chapterhive has been installed " + n.toLocaleString("en") + " times!", body: "Another milestone for the hive.", link: "/hub" }).catch(function () {});
  }
  res.json({ installs: n, milestone: milestoneFor(n), counted: ins.rowCount > 0 });
});

module.exports = router;
