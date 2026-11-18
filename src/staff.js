// src/staff.js
// Limited powers ("staff permissions") the site owner can give to helpers, so they can help run
// Chapterhive without being full admins. Only the owner (users.is_owner) can give or take powers.
// Full admins (role = 'admin') can do everything; staff can only do what their powers allow.

const db = require("./db");

const PERMS = [
  ["approve_posts", "Approve posts", "Review posts waiting for approval (the Reviews tab)."],
  ["approve_creators", "Approve creators", "Accept or turn down creator applications."],
  ["approve_beta", "Approve beta testers", "Approve or decline beta tester applications."],
  ["manage_reservations", "Manage reservations", "See the reserved usernames list (with emails), download it, send claim links and release names."],
  ["handle_reports", "Handle reports", "Deal with reported posts, comments and chat messages."],
  ["moderate_users", "Moderate members", "Warn, suspend or ban members (never admins or other staff)."],
  ["post_updates", "Post updates", "Write and remove announcements (News & updates)."],
  ["view_members", "Members list", "Open 👥 Members from the menu: everyone on Chapterhive, sorted by relevance. Only the owner has it unless given."]
];
const KEYS = PERMS.map(function (p) { return p[0]; });

async function permsOf(userId) {
  const { rows } = await db.query("SELECT role, is_owner, staff_perms, status FROM users WHERE id = $1", [userId]);
  const u = rows[0];
  if (!u || u.status === "banned") return { admin: false, owner: false, perms: [] };
  return { admin: u.role === "admin", owner: Boolean(u.is_owner), perms: u.staff_perms || [] };
}

async function can(req, perm) {
  const u = req.session && req.session.user;
  if (!u) return false;
  if (u.role === "admin") return true;
  const p = await permsOf(u.id);
  return p.admin || p.perms.indexOf(perm) >= 0;
}

// Lets the request through for admins, or staff holding any one of the given powers.
function requireStaff() {
  const wanted = Array.prototype.slice.call(arguments);
  return async function (req, res, next) {
    try {
      if (!req.session || !req.session.user) return res.status(401).json({ error: "Please log in first." });
      for (const perm of wanted) { if (await can(req, perm)) return next(); }
      res.status(403).json({ error: "You don't have permission to do that." });
    } catch (e) { next(e); }
  };
}

async function requireOwner(req, res, next) {
  try {
    if (!req.session || !req.session.user) return res.status(401).json({ error: "Please log in first." });
    const p = await permsOf(req.session.user.id);
    if (!p.owner) return res.status(403).json({ error: "Only the site owner's account can change who has powers." });
    next();
  } catch (e) { next(e); }
}

// Admins plus staff with this power: for bell notifications.
async function staffIds(perm) {
  const { rows } = await db.query("SELECT id FROM users WHERE status = 'active' AND (role = 'admin' OR $1 = ANY(staff_perms))", [perm]);
  return rows.map(function (r) { return r.id; });
}

// The members list is the owner's by default: full admins need the power given to them like anyone else.
async function canSeeMembers(userId) {
  const p = await permsOf(userId);
  return p.owner || p.perms.indexOf("view_members") >= 0;
}

module.exports = { canSeeMembers, PERMS, KEYS, permsOf, can, requireStaff, requireOwner, staffIds };
