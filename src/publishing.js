// src/publishing.js
// When a work becomes public (approved, and its publish time has come), tell the
// creator's followers. Runs every minute, and straight after a save or an approval.

const db = require("./db");
const { notifyMany } = require("./notify");
const { VISIBLE } = require("./routes/posts");

let running = false;

async function announceReady() {
  if (running) return;
  running = true;
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.slug, p.title, p.category, p.user_id, cp.name, u.role
         FROM posts p JOIN creator_profiles cp ON cp.user_id = p.user_id JOIN users u ON u.id = p.user_id
        WHERE p.notified_at IS NULL AND ${VISIBLE}
        ORDER BY p.created_at LIMIT 50`
    );
    for (const post of rows) {
      // Mark first, so a slow notification run never sends the same post twice.
      const claimed = await db.query("UPDATE posts SET notified_at = NOW() WHERE id = $1 AND notified_at IS NULL RETURNING id", [post.id]);
      if (!claimed.rows.length) continue;
      const followers = await db.query("SELECT follower_id FROM follows WHERE creator_id = $1", [post.user_id]);
      const path = post.category === "news" ? "/hub/news/" : "/hub/w/";
      await notifyMany(followers.rows.map(function (f) { return f.follower_id; }), {
        type: "post",
        title: "New from " + post.name + ": " + post.title,
        link: path + encodeURIComponent(post.slug)
      });
    }
  } catch (error) {
    console.error("Publishing notifications failed:", error.message);
  } finally {
    running = false;
  }
}

function start() {
  setInterval(announceReady, 60 * 1000).unref();
  setTimeout(announceReady, 5000).unref();
}

module.exports = { announceReady, start };
