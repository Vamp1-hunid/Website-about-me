// src/trust.js
// Small trust badges shown on member and creator pages.
//  🎓 Verified student: confirmed a school email.
//  🛡️ Whistleblower: at least 3 of their reports were upheld by moderators (reports marked "resolved").
const db = require("./db");

const WHISTLEBLOWER_AT = 3;

async function badgesFor(userId) {
  const { rows } = await db.query(
    `SELECT u.skills, u.school_verified_at, u.is_beta, u.role,
       (SELECT COUNT(*) FROM reports r WHERE r.reporter_id = u.id AND r.status = 'resolved')::int AS upheld
       FROM users u WHERE u.id = $1`, [userId]);
  if (!rows.length) return { skills: [], trustBadges: [], roleTags: [] };
  const r = rows[0];
  const badges = [];
  // Special role tags, shown as official stickers (not typed text).
  const roleTags = [];
  if (r.role === "admin") roleTags.push({ key: "founder", icon: "👑", label: "Chapterhive founder" });
  if (r.is_beta) roleTags.push({ key: "beta", icon: "🧪", label: "Beta tester" });
  if (r.school_verified_at) badges.push({ key: "student", icon: "🎓", label: "Verified student" });
  if (r.upheld >= WHISTLEBLOWER_AT) badges.push({ key: "whistleblower", icon: "🛡️", label: "Whistleblower: helps keep the hive safe" });
  return { skills: r.skills || [], trustBadges: badges, roleTags: roleTags };
}

module.exports = { badgesFor, WHISTLEBLOWER_AT };
