// src/notify.js
// Puts messages in people's notification bell.

const db = require("./db");

// Phone notifications are a bonus: any problem there is logged, never thrown.
function sendPush(ids, n) {
  try { require("./push").sendTo(ids, n).catch(function (e) { console.warn("Push failed:", e.message); }); }
  catch (e) { console.warn("Push failed:", e.message); }
}

// notify(userId, { type, title, body, link })
async function notify(userId, n) {
  if (!userId) return;
  await db.query(
    "INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)",
    [userId, String(n.type || "info").slice(0, 20), String(n.title || "").slice(0, 160), String(n.body || "").slice(0, 1500), String(n.link || "").slice(0, 300)]
  );
  sendPush([userId], n); // phone notification too (never blocks or fails the bell)
}

// The same notification for many people at once (e.g. a creator's followers).
async function notifyMany(userIds, n) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)));
  if (!ids.length) return;
  await db.query(
    `INSERT INTO notifications (user_id, type, title, body, link)
     SELECT u, $2, $3, $4, $5 FROM unnest($1::int[]) AS u`,
    [ids, String(n.type || "info").slice(0, 20), String(n.title || "").slice(0, 160), String(n.body || "").slice(0, 1500), String(n.link || "").slice(0, 300)]
  );
  sendPush(ids, n);
}

// Tell every admin (new applications and reservations land in their bell).
async function notifyAdmins(n) {
  const { rows } = await db.query("SELECT id FROM users WHERE role = 'admin'");
  await notifyMany(rows.map(function (r) { return r.id; }), n);
}

// Admins and staff who hold a power (e.g. "approve_beta").
async function notifyStaff(perm, n) {
  await notifyMany(await require("./staff").staffIds(perm), n);
}

module.exports = { notify, notifyMany, notifyAdmins, notifyStaff };
