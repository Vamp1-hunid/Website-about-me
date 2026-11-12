// src/routes/comments.js
// Deleting a comment: members can delete their own; the admin can delete any.

const express = require("express");
const db = require("../db");
const { requireLogin } = require("../auth");

const router = express.Router();

// DELETE /api/comments/:id
router.delete("/:id", requireLogin, async function (req, res) {
  if (!/^\d{1,9}$/.test(req.params.id)) {
    return res.status(404).json({ error: "That comment could not be found." });
  }
  const viewer = req.session.user;
  const { rows } = await db.query(
    `DELETE FROM comments
      WHERE id = $1 AND ($2 = 'admin' OR user_id = $3)
      RETURNING id`,
    [Number(req.params.id), viewer.role, viewer.id]
  );
  if (!rows.length) {
    return res.status(404).json({ error: "That comment could not be found, or it is not yours." });
  }
  res.json({ ok: true });
});

module.exports = router;
