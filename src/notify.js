// src/notify.js
// Puts messages in people's notification bell.

const db = require("./db");

// notify(userId, { type, title, body, link })
async function notify(userId, n) {
  if (!userId) return;
  await db.query(
    "INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)",
    [userId, String(n.type || "info").slice(0, 20), String(n.title || "").slice(0, 160), String(n.body || "").slice(0, 1500), String(n.link || "").slice(0, 300)]
  );
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
}

module.exports = { notify, notifyMany };
