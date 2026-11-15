// src/interests.js
// Personalises the home feed. Each member has a weight per category (novel, song, film...) and per genre
// (horror, romance...). Positive = show more, negative = show less; strongly negative = hidden from "For you".
//
//   welcome survey pick ........ +4 each
//   "See more like this" ....... +3 on the post's category and genres
//   "See less like this" ....... -4
//   like ........................ +1      save ........ +2
// Weights are kept between -12 and +20.

const db = require("./db");

const MIN = -12, MAX = 20, HIDE_AT = -8;

async function bump(userId, kind, key, delta) {
  if (!userId || !key) return;
  await db.query(
    `INSERT INTO user_interests (user_id, kind, key, weight) VALUES ($1, $2, $3, GREATEST($5::int, LEAST($6::int, $4::int)))
     ON CONFLICT (user_id, kind, key) DO UPDATE
       SET weight = GREATEST($5::int, LEAST($6::int, user_interests.weight + $4::int)), updated_at = NOW()`,
    [userId, kind, String(key).slice(0, 20), delta, MIN, MAX]);
}

// Nudges the interests that match a post (its category and genres).
async function fromPost(userId, postId, delta) {
  const { rows } = await db.query("SELECT category, genres FROM posts WHERE id = $1", [postId]);
  if (!rows.length) return;
  await bump(userId, "category", rows[0].category, delta);
  for (const g of rows[0].genres || []) await bump(userId, "genre", g, delta);
}

async function list(userId) {
  const { rows } = await db.query("SELECT kind, key, weight FROM user_interests WHERE user_id = $1 ORDER BY weight DESC", [userId]);
  return rows;
}

// SQL pieces for the posts list: an ordering bonus (in hours) and a filter for strongly disliked kinds.
// $n is the parameter number holding the user id.
function feedSql(n) {
  const score = `COALESCE((SELECT SUM(ui.weight) FROM user_interests ui WHERE ui.user_id = $${n}
      AND ((ui.kind = 'category' AND ui.key = p.category) OR (ui.kind = 'genre' AND ui.key = ANY (p.genres)))), 0)`;
  return {
    bonus: `(${score}) * INTERVAL '3 hours'`,
    hide: `NOT EXISTS (SELECT 1 FROM user_interests ui WHERE ui.user_id = $${n} AND ui.kind = 'category'
              AND ui.key = p.category AND ui.weight <= ${HIDE_AT})`
  };
}

module.exports = { bump, fromPost, list, feedSql, HIDE_AT };
