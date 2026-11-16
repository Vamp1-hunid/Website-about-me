// src/flags.js
// Feature flags ("version control" for features): each new feature can be
//   off       hidden from everyone
//   admin     only the site owner sees it (test it live)
//   beta      the owner + members marked as beta testers in Manage users
//   everyone  switched on for all
// Changed in Dashboard -> Features. The server checks flags too, not just the pages.

const db = require("./db");

// [key, label, description, starting audience, group]
// The starting audience only applies the first time a switch is created; after that the admin decides.
const DEFAULTS = [
  // Accounts & community
  ["signups", "New accounts", "People can create new accounts (log in always keeps working).", "everyone", "Accounts & community"],
  ["reservations", "Pre-launch username reservations", "Instead of creating accounts, visitors reserve a username with their email; at launch you send them links to claim it. Turn New accounts off while this runs.", "off", "Accounts & community"],
  ["chat", "Chat", "Members can message each other and share works they're enjoying.", "everyone", "Accounts & community"],
  ["comments", "Comments", "Members can write and reply to comments.", "everyone", "Accounts & community"],
  ["likes", "Likes & saves", "Members can like and save works.", "everyone", "Accounts & community"],
  ["follows", "Following creators", "Members can follow creators and get their posts in the Following feed.", "everyone", "Accounts & community"],
  ["notifications", "Notification bell", "Bell with new posts from people you follow, new followers, milestones, trending and announcements.", "admin", "Accounts & community"],
  ["streaks", "Online streaks", "Counts the days in a row someone visits, shown on their profile and the menu.", "admin", "Accounts & community"],
  ["group_chats", "Group chats", "Members can make group chats (up to 30 people) and share works in them.", "everyone", "Accounts & community"],
  ["daily_verse", "Daily Bible verse", "Members can choose to see a daily Bible verse at the top of their feed (Settings).", "everyone", "Accounts & community"],
  ["calendar", "Calendar & holiday themes", "The calendar page with Zambian and international holidays and your events, plus holiday banners and themes.", "everyone", "Help & discovery"],
  ["comic_maker", "Web comic panel maker", "A tool in the studio for laying out comic panels with speech bubbles and saving them as a page.", "everyone", "Creating"],
  ["rankings", "Top creators & badges", "Ranks the most popular creators (top 10 overall, top 5 per shelf), gives them badges and boosts their posts in the home feed.", "everyone", "Accounts & community"],
  ["online_status", "Online status", "Green dot on creators and members who are online (they can turn it off).", "admin", "Accounts & community"],
  // Creating
  ["creating", "Create (posting)", "Creators can publish and edit posts. Switch off to pause all new posts except yours.", "everyone", "Creating"],
  ["creator_applications", "Creator applications", "Members can apply to become creators.", "everyone", "Creating"],
  ["collabs", "Collab board", "The collab board: browsing, posting and replying to collab requests.", "everyone", "Creating"],
  ["polls", "Polls & questionnaires", "Creators can attach a poll or questionnaire to a post.", "admin", "Creating"],
  // Money & business
  ["donations", "Donations (Fund the heist)", "The support / donation button across the site.", "everyone", "Money & business"],
  ["hub_support", "Fund the heist on Chapterhive", "Shows the support button on Chapterhive pages too.", "admin", "Money & business"],
  ["sponsor_page", "Sponsor page", "The page for companies and investors with your business contact details.", "admin", "Money & business"],
  ["premium", "Premium plan", "The Premium page, waitlist and custom creator pages. Keep it queued until payments are ready.", "admin", "Money & business"],
  // News
  ["updates", "News & updates", "Chapterhive's News & updates and the God's Banditos Updates section. Suspend to hide all update posts.", "everyone", "News"],
  // Help & discovery
  ["search", "Search", "The search box and search results pages.", "everyone", "Help & discovery"],
  ["help_assistant", "Help assistant", "The ? chat that answers questions from the FAQ (uses AI if an AI key is set).", "everyone", "Help & discovery"],
  ["suggestion_box", "Suggestion box", "Members can send suggestions to your inbox from the collab board and help page.", "admin", "Help & discovery"],
  ["quick_tips", "Quick tips", "Small dismissible tips that help people find their way around.", "admin", "Help & discovery"]
];

let cache = null;
let cachedAt = 0;
let nextLaunch = 0;

async function ensureDefaults() {
  for (const [key, label, description, audience, group] of DEFAULTS) {
    await db.query(
      `INSERT INTO feature_flags (key, label, description, audience, grp) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, grp = EXCLUDED.grp`,
      [key, label, description, audience || "admin", group || "Extras"]
    );
  }
  cache = null;
}

async function all() {
  if (cache && Date.now() - cachedAt < 15000 && !(nextLaunch && Date.now() >= nextLaunch)) return cache;
  // A scheduled launch: once launch_at has passed the switch counts as "everyone" (and is saved that way).
  await db.query("UPDATE feature_flags SET audience = 'everyone', launch_at = NULL, updated_at = NOW() WHERE launch_at IS NOT NULL AND launch_at <= NOW()");
  const { rows } = await db.query("SELECT key, label, description, audience, launch_at, grp, display, updated_at FROM feature_flags ORDER BY grp, label");
  cache = rows;
  cachedAt = Date.now();
  // Refresh as soon as the next scheduled launch is due, not 15 seconds later.
  nextLaunch = rows.reduce(function (soonest, f) {
    const t = f.launch_at ? new Date(f.launch_at).getTime() : 0;
    return t && (!soonest || t < soonest) ? t : soonest;
  }, 0);
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

// Features that are off for this person but should still be shown with a friendly notice.
// -> { chat: { notice: "soon", label: "Chat", launchAt } }
async function noticesFor(user) {
  const rows = await all();
  const out = {};
  rows.forEach(function (f) {
    if (f.display !== "hide" && !allowed(f.audience, user)) out[f.key] = { notice: f.display, label: f.label, launchAt: f.launch_at || null };
  });
  return out;
}

const NOTICE_TEXT = { soon: "is coming soon", maintenance: "is under maintenance right now" };

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
// options.adminAlways: the admin can still use it while it's switched off (e.g. posting).
function requireFlag(key, options) {
  return async function (req, res, next) {
    if (options && options.adminAlways && req.session && req.session.user && req.session.user.role === "admin") return next();
    if (await isOn(key, req)) return next();
    const rows = await all();
    const flag = rows.find(function (f) { return f.key === key; });
    const phrase = flag && NOTICE_TEXT[flag.display] ? NOTICE_TEXT[flag.display] : "isn't available right now";
    res.status(503).json({ error: (flag ? flag.label : "That feature") + " " + phrase + ". Please check back soon.", feature: key, notice: flag ? flag.display : "hide" });
  };
}

async function setDisplay(key, display) {
  const { rows } = await db.query(
    "UPDATE feature_flags SET display = $1, updated_at = NOW() WHERE key = $2 RETURNING key, label, description, audience, launch_at, grp, display, updated_at",
    [display, key]);
  cache = null;
  return rows[0] || null;
}

async function setAudience(key, audience, launchAt) {
  const { rows } = await db.query(
    "UPDATE feature_flags SET audience = $1, launch_at = $3, updated_at = NOW() WHERE key = $2 RETURNING key, label, description, audience, launch_at, grp, display, updated_at",
    [audience, key, launchAt || null]
  );
  cache = null;
  return rows[0] || null;
}

module.exports = { ensureDefaults, all, enabledFor, noticesFor, isOn, requireFlag, setAudience, setDisplay, DEFAULTS };
