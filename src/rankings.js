// src/rankings.js
// Keeps track of the most popular creators and gives them badges and a boost in the home feed.
//
//  - Top 10 overall, across every category.
//  - Top 5 in each shelf: Books, Comics & manga, Art, Film & video, Music & poetry, Writing, Comedy.
//
// Popularity score, from the last 30 days (so new creators can climb and old fame fades):
//   each like = 1, each save = 2, each comment = 2, each new follower = 3, each work published = 1.
// For shelves only the activity on works in that shelf counts (followers count overall only).
// Recalculated every 30 minutes, and on demand by the admin.

const db = require("./db");
const { notify } = require("./notify");

const SCOPES = {
  books: ["novel", "storybook", "educational"],
  comics: ["story-art"],
  art: ["art", "meme"],
  video: ["anime", "film", "series", "trailer"],
  music: ["song", "poetry"],
  writing: ["writing", "thoughts", "poetry", "novel"],
  comedy: ["comedy", "meme"]
};
const SCOPE_NAMES = { overall: "Chapterhive", books: "Books", comics: "Comics & manga", art: "Art", video: "Film & video",
  music: "Music & poetry", writing: "Writing", comedy: "Comedy" };
const TOP_OVERALL = 10;
const TOP_SCOPE = 5;

// The badge someone wears for a rank.
function badgeFor(scope, rank) {
  // All bees: the Bumblebee sits on top of the hive.
  if (scope === "overall") {
    if (rank === 1) return { icon: "👑🐝", label: "Bumblebee · #1 on Chapterhive", tier: "gold" };
    if (rank <= 3) return { icon: "🐝", label: "Honey Bee · Top 3", tier: "silver" };
    return { icon: "🐝", label: "Worker Bee · Top 10", tier: "bronze" };
  }
  if (rank === 1) return { icon: "🐝", label: "Mason Bee · #1 in " + SCOPE_NAMES[scope], tier: "bloom" };
  return { icon: "🐝", label: "Busy Bee · Top 5 in " + SCOPE_NAMES[scope], tier: "scope" };
}

function badgesFrom(list) {
  return (list || []).slice().sort(function (a, b) {
    return (a.scope === "overall" ? 0 : 1) - (b.scope === "overall" ? 0 : 1) || a.rank - b.rank;
  }).map(function (r) { return Object.assign({ scope: r.scope, rank: r.rank }, badgeFor(r.scope, r.rank)); });
}

const WORK_SCORE = (cats) => `
  SELECT p.user_id,
    SUM((SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id AND l.created_at > NOW() - INTERVAL '30 days'))
    + 2 * SUM((SELECT COUNT(*) FROM favourites f WHERE f.post_id = p.id AND f.created_at > NOW() - INTERVAL '30 days'))
    + 2 * SUM((SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id AND c.created_at > NOW() - INTERVAL '30 days' AND c.user_id <> p.user_id))
    + COUNT(*) FILTER (WHERE p.created_at > NOW() - INTERVAL '30 days') AS score
  FROM posts p JOIN creator_profiles cp ON cp.user_id = p.user_id AND cp.status = 'approved'
  WHERE p.published AND p.review_status = 'approved' AND (p.publish_at IS NULL OR p.publish_at <= NOW())
    AND p.category NOT IN ('news', 'updates') ${cats ? "AND p.category = ANY ($1::text[])" : ""}
  GROUP BY p.user_id`;

async function compute() {
  const results = {};
  const overall = await db.query(
    `SELECT w.user_id, (w.score + 3 * COALESCE(f.n, 0))::int AS score FROM (${WORK_SCORE(null)}) w
       LEFT JOIN (SELECT creator_id, COUNT(*) AS n FROM follows WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY creator_id) f
         ON f.creator_id = w.user_id
      WHERE w.score + 3 * COALESCE(f.n, 0) > 0
      ORDER BY score DESC, w.user_id LIMIT ${TOP_OVERALL}`);
  results.overall = overall.rows;
  for (const scope of Object.keys(SCOPES)) {
    const r = await db.query(
      `SELECT user_id, score::int AS score FROM (${WORK_SCORE(true)}) w WHERE score > 0 ORDER BY score DESC, user_id LIMIT ${TOP_SCOPE}`,
      [SCOPES[scope]]);
    results[scope] = r.rows;
  }
  return results;
}

let running = false;
async function refresh() {
  if (running) return;
  running = true;
  try {
    const previous = await db.query("SELECT user_id, scope, rank FROM creator_ranks");
    const before = {};
    previous.rows.forEach(function (r) { before[r.user_id + ":" + r.scope] = r.rank; });
    const results = await compute();
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM creator_ranks");
      for (const scope of Object.keys(results)) {
        let rank = 0;
        for (const row of results[scope]) {
          rank += 1;
          await client.query("INSERT INTO creator_ranks (user_id, scope, rank, score) VALUES ($1, $2, $3, $4)", [row.user_id, scope, rank, row.score]);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // Tell creators when they earn a new badge (or climb to #1).
    for (const scope of Object.keys(results)) {
      let rank = 0;
      for (const row of results[scope]) {
        rank += 1;
        const old = before[row.user_id + ":" + scope];
        if (!old || (rank === 1 && old !== 1)) {
          const b = badgeFor(scope, rank);
          await notify(row.user_id, { type: "milestone", title: b.icon + " You earned a badge: " + b.label,
            body: "Your work is one of the most loved on Chapterhive right now. Your posts get a boost in the home feed while you hold it.",
            link: "/hub/creators#top" }).catch(function () {});
        }
      }
    }
  } finally {
    running = false;
  }
}

async function leaderboard() {
  const { rows } = await db.query(
    `SELECT cr.scope, cr.rank, cr.score, cr.computed_at, cp.handle, cp.name, cp.tagline, u.avatar_url
       FROM creator_ranks cr JOIN creator_profiles cp ON cp.user_id = cr.user_id JOIN users u ON u.id = cr.user_id
      ORDER BY cr.scope, cr.rank`);
  return rows;
}

function start() {
  setTimeout(function () { refresh().catch(function (e) { console.error("Rankings:", e.message); }); }, 5000);
  setInterval(function () { refresh().catch(function (e) { console.error("Rankings:", e.message); }); }, 30 * 60 * 1000).unref();
}

module.exports = { refresh, leaderboard, start, badgeFor, badgesFrom, SCOPES, SCOPE_NAMES };
