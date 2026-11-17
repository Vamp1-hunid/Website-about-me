// src/announcements.js
// Team announcements (Dashboard → Announcements). An announcement goes live at its created_at time, which
// can be in the future to schedule it. Drafts (is_draft) are only seen in the dashboard until they are sent. When it goes live, everyone it's for gets a phone notification.
// The bell and News & updates work out who sees it when they open them (src/routes/notifications.js).

const db = require("./db");

// SQL that matches the people an announcement is for. $n is the announcement's audience ('all' or 'beta,creators').
function audienceSql(n) {
  return `(${n} = 'all' OR u.role = 'admin'
    OR ('creators' = ANY (string_to_array(${n}, ',')) AND EXISTS (SELECT 1 FROM creator_profiles cp WHERE cp.user_id = u.id AND cp.status = 'approved'))
    OR ('beta' = ANY (string_to_array(${n}, ',')) AND u.is_beta)
    OR ('staff' = ANY (string_to_array(${n}, ',')) AND cardinality(u.staff_perms) > 0))`;
}

// Sends the phone notification for every announcement that has gone live and hasn't been sent yet.
let running = false;
async function pushDue() {
  if (running) return;
  running = true;
  try {
    const { rows } = await db.query(
      `UPDATE announcements SET pushed_at = NOW()
        WHERE pushed_at IS NULL AND NOT is_draft AND created_at <= NOW() AND created_at > NOW() - INTERVAL '1 day'
        RETURNING id, title, body, link, audience`);
    for (const a of rows) {
      const who = await db.query(
        `SELECT DISTINCT s.user_id FROM push_subscriptions s JOIN users u ON u.id = s.user_id
          WHERE u.status = 'active' AND ${audienceSql("$1")}`, [a.audience]);
      await require("./push").sendTo(who.rows.map(function (r) { return r.user_id; }),
        { type: "announce-" + a.id, title: "📣 " + a.title, body: (a.body || "").slice(0, 200), link: a.link || "/hub/news#announcement-" + a.id });
    }
  } catch (e) {
    console.warn("Announcement notifications failed:", e.message);
  } finally {
    running = false;
  }
}

module.exports = { audienceSql, pushDue };
