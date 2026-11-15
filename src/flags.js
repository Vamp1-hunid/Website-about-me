// src/flags.js
// Feature flags ("version control" for features): each new feature can be
//   off       hidden from everyone
//   admin     only the site owner sees it (test it live)
//   beta      the owner + members marked as beta testers in Manage users
//   everyone  switched on for all
// Changed in Dashboard -> Features. The server checks flags too, not just the pages.

const db = require("./db");

const DEFAULTS = [
  ["notifications", "Notification bell", "Bell with new posts from people you follow, new followers, milestones, trending and announcements."],
  ["streaks", "Online streaks", "Counts the days in a row someone visits, shown on their profile and the menu."],
  ["online_status", "Online status", "Green dot on creators and members who are online (they can turn it off)."],
  ["polls", "Polls & questionnaires", "Creators can attach a poll or questionnaire to a post."],
  ["quick_tips", "Quick tips", "Small dismissible tips that help people find their way around."],
  ["help_assistant", "Help assistant", "The ? chat that answers questions from the FAQ (uses AI if an AI key is set)."],
  ["suggestion_box", "Suggestion box", "Members can send suggestions to your inbox from the collab board and help page."],
  ["sponsor_page", "Sponsor page", "The page for companies and investors with your business contact details."],
  ["hub_support", "Fund the heist on Chapterhive", "Shows the support button on Chapterhive pages too."]
];

let cache = null;
let cachedAt = 0;

async function ensureDefaults() {
  for (const [key, label, description] of DEFAULTS) {
    await db.query(
      "INSERT INTO feature_flags (key, label, description, audience) VALUES ($1, $2, $3, 'admin') ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description",
      [key, label, description]
    );
  }
  cache = null;
}

async function all() {
  if (cache && Date.now() - cachedAt < 15000) return cache;
  const { rows } = await db.query("SELECT key, label, description, audience, updated_at FROM feature_flags ORDER BY key");
  cache = rows;
  cachedAt = Date.now();
  return rows;
}

function allowed(audience, user) {
  if (audience === "everyone") return true;
  if (!user) return false;
  if (user.role === "admin") return audience !== "off";
  if (audience === "beta") return Boolean(user.is_beta);
  return false;
}

// The keys switched on for this person (user may be null for visitors).
async function enabledFor(user) {
  const rows = await all();
  return rows.filter(function (f) { return allowed(f.audience, user); }).map(function (f) { return f.key; });
}

// For routes: is this feature on for whoever is asking?
async function isOn(key, req) {
  const rows = await all();
  const flag = rows.find(function (f) { return f.key === key; });
  if (!flag) return false;
  let user = req.session && req.session.user ? Object.assign({}, req.session.user) : null;
  if (user && flag.audience === "beta" && user.role !== "admin") {
    const { rows: r } = await db.query("SELECT is_beta FROM users WHERE id = $1", [user.id]);
    user.is_beta = Boolean(r[0] && r[0].is_beta);
  }
  return allowed(flag.audience, user);
}

// Express helper: 404 while a feature is off for this person.
function requireFlag(key) {
  return async function (req, res, next) {
    if (await isOn(key, req)) return next();
    res.status(404).json({ error: "That feature isn't available yet." });
  };
}

async function setAudience(key, audience) {
  const { rows } = await db.query(
    "UPDATE feature_flags SET audience = $1, updated_at = NOW() WHERE key = $2 RETURNING key, label, description, audience, updated_at",
    [audience, key]
  );
  cache = null;
  return rows[0] || null;
}

module.exports = { ensureDefaults, all, enabledFor, isOn, requireFlag, setAudience, DEFAULTS };
