// src/routes/users.js
// Public member pages (/u/<username>): name, picture, when they joined and their recent comments.
// Favourites and likes stay private: only counts are shown.

const express = require("express");
const db = require("../db");
const { avatarUrl } = require("../storage");

const router = express.Router();

// GET /api/users/:username
router.get("/:username", async function (req, res) {
  const username = String(req.params.username || "").toLowerCase();
  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return res.status(404).json({ error: "That member could not be found." });
  }

  const { rows } = await db.query(
    `SELECT u.id, u.username, u.display_name, u.role, u.avatar_url, u.created_at, u.streak_count, u.streak_best, u.status,
       (u.show_online AND u.last_seen_at > NOW() - INTERVAL '5 minutes') AS online,
       (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id
         WHERE c.user_id = u.id AND (p.published AND p.review_status = 'approved' AND (p.publish_at IS NULL OR p.publish_at <= NOW())))::int AS comments,
       (SELECT COUNT(*) FROM likes l WHERE l.user_id = u.id)::int AS likes
       FROM users u WHERE u.username = $1`,
    [username]
  );
  const user = rows[0];
  if (!user) {
    return res.status(404).json({ error: "That member could not be found." });
  }

  const recent = await db.query(
    `SELECT c.id, c.body, c.created_at, c.edited_at, c.parent_id, p.slug, p.title
       FROM comments c JOIN posts p ON p.id = c.post_id
      WHERE c.user_id = $1 AND (p.published AND p.review_status = 'approved' AND (p.publish_at IS NULL OR p.publish_at <= NOW()))
      ORDER BY c.created_at DESC LIMIT 20`,
    [user.id]
  );

  res.json({
    user: {
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      avatarUrl: avatarUrl(user.avatar_url),
      joined: user.created_at,
      comments: user.comments,
      likes: user.likes,
      online: !!user.online,
      streak: user.streak_count || 0,
      streakBest: user.streak_best || 0,
      banned: user.status === "banned"
    },
    recentComments: recent.rows.map(function (row) {
      return {
        id: row.id,
        body: row.body,
        createdAt: row.created_at,
        editedAt: row.edited_at,
        isReply: Boolean(row.parent_id),
        work: { slug: row.slug, title: row.title }
      };
    })
  });
});

module.exports = router;
