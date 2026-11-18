// src/downloads.js
// Who can download videos, audio and pictures from works (Dashboard → Settings → Downloads).
// Everyone else can stream and view as usual, but gets no download button, and the video player's
// own "Download" menu item is hidden for them.
// Groups the owner can switch on, any mix: members (every logged-in member), premium (Premium plan
// members), team (admins and staff), beta (beta testers). Visitors who aren't logged in never can. The creator of a work can always download their own files.

const db = require("./db");
const { planOf } = require("./plans");

const GROUPS = ["members", "premium", "team", "beta"];

async function readSetting() {
  const { rows } = await db.query("SELECT value FROM app_settings WHERE key = 'downloads'");
  try {
    const v = rows[0] ? JSON.parse(rows[0].value) : {};
    return { groups: (v.groups || []).filter(function (g) { return GROUPS.includes(g); }) };
  } catch (e) {
    return { groups: [] };
  }
}

async function saveSetting(groups) {
  const clean = (Array.isArray(groups) ? groups : []).filter(function (g, i, all) { return GROUPS.includes(g) && all.indexOf(g) === i; });
  await db.query(
    "INSERT INTO app_settings (key, value) VALUES ('downloads', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify({ groups: clean })]);
  return { groups: clean };
}

// Can this logged-in user (id) download files? ownerId: the work's creator (always allowed).
async function canDownload(userId, ownerId) {
  if (!userId) return false;
  if (ownerId && userId === ownerId) return true;
  const { groups } = await readSetting();
  if (!groups.length) return false;
  if (groups.includes("members")) return true; // any logged-in member
  const u = (await db.query("SELECT role, is_beta, plan, plan_until, staff_perms FROM users WHERE id = $1", [userId])).rows[0];
  if (!u) return false;
  if (groups.includes("team") && (u.role === "admin" || (u.staff_perms && u.staff_perms.length))) return true;
  if (groups.includes("beta") && u.is_beta) return true;
  if (groups.includes("premium") && planOf(u) && planOf(u).key === "premium") return true;
  return false;
}

module.exports = { GROUPS, readSetting, saveSetting, canDownload };
