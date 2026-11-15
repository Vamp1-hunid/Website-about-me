// src/routes/comments.js
// Editing and deleting a comment:
//  - members can edit and delete their own comments;
//  - the admin can delete any comment (but only edit their own, so nobody's words are changed for them).

const express = require("express");
const db = require("../db");
const { requireLogin } = require("../auth");
const { toComment, COMMENT_SELECT } = require("./posts");

const router = express.Router();

router.param("id", function (req, res, next, value) {
  if (!/^\d{1,9}$/.test(value)) {
    return res.status(404).json({ error: "That comment could not be found." });
  }
  next();
});

// PUT /api/comments/:id  { body }
router.put("/:id", requireLogin, async function (req, res) {
  const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
  if (!body || body.length > 1000) {
    return res.status(400).json({ error: "Comments must be between 1 and 1000 characters." });
  }
  const updated = await db.query(
    `UPDATE comments SET body = $1, edited_at = NOW()
      WHERE id = $2 AND user_id = $3 AND body IS DISTINCT FROM $1
      RETURNING id`,
    [body, Number(req.params.id), req.session.user.id]
  );
  const { rows } = await db.query(COMMENT_SELECT + " WHERE c.id = $1 AND c.user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!rows.length) {
    return res.status(404).json({ error: "That comment could not be found, or it is not yours." });
  }
  res.json({ comment: toComment(rows[0], req.session.user), changed: updated.rows.length > 0 });
});

// DELETE /api/comments/:id  (replies under it are removed too)
// Allowed for the comment's author, the creator of the work it's on, and the admin.
router.delete("/:id", requireLogin, async function (req, res) {
  const viewer = req.session.user;
  const { rows } = await db.query(
    `DELETE FROM comments
      WHERE id = $1 AND ($2 = 'admin' OR user_id = $3
        OR post_id IN (SELECT id FROM posts WHERE user_id = $3))
      RETURNING id`,
    [Number(req.params.id), viewer.role, viewer.id]
  );
  if (!rows.length) {
    return res.status(404).json({ error: "That comment could not be found, or it is not yours." });
  }
  res.json({ ok: true });
});

module.exports = router;
