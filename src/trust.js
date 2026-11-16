// src/trust.js
// Small trust badges shown on member and creator pages.
//  🎓 Verified student: confirmed a school email.
//  🛡️ Whistleblower: at least 3 of their reports were upheld by moderators (reports marked "resolved").
const db = require("./db");

const WHISTLEBLOWER_AT = 3;

async function badgesFor(userId) {
  const { rows } = await db.query(
    `SELECT u.skills, u.school_verified_at,
       (SELECT COUNT(*) FROM reports r WHERE r.reporter_id = u.id AND r.status = 'resolved')::int AS upheld
       FROM users u WHERE u.id = $1`, [userId]);
  if (!rows.length) return { skills: [], trustBadges: [] };
  const r = rows[0];
  const badges = [];
  if (r.school_verified_at) badges.push({ key: "student", icon: "🎓", label: "Verified student" });
  if (r.upheld >= WHISTLEBLOWER_AT) badges.push({ key: "whistleblower", icon: "🛡️", label: "Whistleblower: helps keep the hive safe" });
  return { skills: r.skills || [], trustBadges: badges };
}

module.exports = { badgesFor, WHISTLEBLOWER_AT };
