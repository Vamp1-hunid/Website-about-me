// src/routes/users.js
// Public member pages (/u/<username>): name, picture, when they joined and their recent comments.
// Favourites and likes stay private: only counts are shown.

const express = require("express");
const db = require("../db");
const { avatarUrl } = require("../storage");
const { requireLogin } = require("../auth");

const router = express.Router();

// GET /api/users/:username
// Member pages are for people with an account.
// GET /api/users?q=  - find members (signed-in people only), so beta testers and members can find each other.
// Only names, pictures and tags are listed; private pages are left out.
router.get("/", requireLogin, async function (req, res) {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().replace(/^@/, "").slice(0, 40) : "";
  const like = "%" + q.replace(/[%_\\]/g, "\\$&") + "%";
  const me = req.session.user.id;
  const { rows } = await db.query(
    `SELECT u.id, u.username, u.display_name, u.avatar_url, u.is_beta, u.role, u.bio,
            (u.show_online AND u.last_seen_at > NOW() - INTERVAL '5 minutes') AS online,
            cp.handle AS creator_handle,
            EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.creator_id = u.id) AS following,
            (SELECT CASE WHEN b.status = 'accepted' THEN 'buddies' WHEN b.requester_id = $2 THEN 'sent' ELSE 'received' END
               FROM buddies b WHERE LEAST(b.requester_id, b.addressee_id) = LEAST(u.id, $2) AND GREATEST(b.requester_id, b.addressee_id) = GREATEST(u.id, $2)) AS buddy_state
       FROM users u LEFT JOIN creator_profiles cp ON cp.user_id = u.id AND cp.status = 'approved'
      WHERE u.status = 'active' AND u.profile_visible AND u.id <> $2
        AND ($1 = '%%' OR u.username ILIKE $1 OR u.display_name ILIKE $1)
      ORDER BY u.is_beta DESC, (u.role = 'admin') DESC, u.last_seen_at DESC NULLS LAST, u.created_at DESC
      LIMIT 60`, [like, me]);
  res.json({ members: rows.map(function (u) {
    return { username: u.username, displayName: u.display_name, avatarUrl: avatarUrl(u.avatar_url), isBeta: u.is_beta,
      isAdmin: u.role === "admin", creatorHandle: u.creator_handle || null, online: Boolean(u.online), following: u.following, buddyState: u.buddy_state || "none",
      bio: (u.bio || "").slice(0, 140) };
  }) });
});

// POST / DELETE /api/users/:username/follow  - members can follow each other (creators too).
async function followMember(req, res) {
  const username = String(req.params.username || "").toLowerCase();
  const { rows } = await db.query("SELECT id, username, profile_visible, status FROM users WHERE username = $1", [username]);
  const target = rows[0];
  if (!target || target.status !== "active") return res.status(404).json({ error: "That member could not be found." });
  if (target.id === req.session.user.id) return res.status(400).json({ error: "You can't follow yourself." });
  let added = null;
  if (req.method === "POST") {
    added = await db.query("INSERT INTO follows (follower_id, creator_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [req.session.user.id, target.id]);
  } else {
    await db.query("DELETE FROM follows WHERE follower_id = $1 AND creator_id = $2", [req.session.user.id, target.id]);
  }
  const count = (await db.query("SELECT COUNT(*)::int AS n FROM follows WHERE creator_id = $1", [target.id])).rows[0].n;
  if (added && added.rowCount) {
    const me = req.session.user;
    await require("../notify").notify(target.id, { type: "follower", title: (me.displayName || me.username) + " followed you",
      body: "You now have " + count + " follower" + (count === 1 ? "" : "s") + ".", link: "/hub/u/" + me.username });
  }
  res.json({ following: req.method === "POST", followers: count });
}
router.post("/:username/follow", requireLogin, require("../flags").requireFlag("follows"), followMember);
router.delete("/:username/follow", requireLogin, require("../flags").requireFlag("follows"), followMember);

/* ---------- Followers, following and buddies ---------- */

const PERSON = "u.username, u.display_name, u.avatar_url, u.is_beta, u.role";
function person(u) {
  return { username: u.username, displayName: u.display_name, avatarUrl: avatarUrl(u.avatar_url), isBeta: u.is_beta, isAdmin: u.role === "admin" };
}

// GET /api/users/me/people -> my followers, who I follow, my buddies and buddy requests
router.get("/me/people", requireLogin, async function (req, res) {
  const me = req.session.user.id;
  const [followers, following, buddies, incoming, outgoing] = await Promise.all([
    db.query(`SELECT ${PERSON}, f.created_at AS since,
                     EXISTS (SELECT 1 FROM follows b WHERE b.follower_id = $1 AND b.creator_id = u.id) AS follow_back
                FROM follows f JOIN users u ON u.id = f.follower_id
               WHERE f.creator_id = $1 AND u.status = 'active' ORDER BY f.created_at DESC LIMIT 500`, [me]),
    db.query(`SELECT ${PERSON}, f.created_at AS since FROM follows f JOIN users u ON u.id = f.creator_id
               WHERE f.follower_id = $1 AND u.status = 'active' ORDER BY f.created_at DESC LIMIT 500`, [me]),
    db.query(`SELECT ${PERSON}, b.responded_at AS since FROM buddies b
                JOIN users u ON u.id = CASE WHEN b.requester_id = $1 THEN b.addressee_id ELSE b.requester_id END
               WHERE (b.requester_id = $1 OR b.addressee_id = $1) AND b.status = 'accepted' AND u.status = 'active'
               ORDER BY u.username LIMIT 500`, [me]),
    db.query(`SELECT ${PERSON}, b.created_at AS since FROM buddies b JOIN users u ON u.id = b.requester_id
               WHERE b.addressee_id = $1 AND b.status = 'pending' AND u.status = 'active' ORDER BY b.created_at DESC`, [me]),
    db.query(`SELECT ${PERSON}, b.created_at AS since FROM buddies b JOIN users u ON u.id = b.addressee_id
               WHERE b.requester_id = $1 AND b.status = 'pending' AND u.status = 'active' ORDER BY b.created_at DESC`, [me])
  ]);
  const map = function (rows, extra) { return rows.map(function (u) { return Object.assign(person(u), { since: u.since }, extra ? extra(u) : {}); }); };
  res.json({
    followers: map(followers.rows, function (u) { return { followBack: u.follow_back }; }),
    following: map(following.rows),
    buddies: map(buddies.rows),
    requests: map(incoming.rows),
    sent: map(outgoing.rows)
  });
});

async function findTarget(req, res) {
  const username = String(req.params.username || "").toLowerCase();
  const { rows } = await db.query("SELECT id, username, status FROM users WHERE username = $1", [username]);
  const target = rows[0];
  if (!target || target.status !== "active") { res.status(404).json({ error: "That member could not be found." }); return null; }
  if (target.id === req.session.user.id) { res.status(400).json({ error: "That's you!" }); return null; }
  return target;
}
async function buddyRow(a, b) {
  const { rows } = await db.query("SELECT * FROM buddies WHERE LEAST(requester_id, addressee_id) = LEAST($1::int, $2::int) AND GREATEST(requester_id, addressee_id) = GREATEST($1::int, $2::int)", [a, b]);
  return rows[0] || null;
}
function buddyState(row, me) {
  if (!row) return "none";
  if (row.status === "accepted") return "buddies";
  return row.requester_id === me ? "sent" : "received";
}

// POST /api/users/:username/buddy -> send a buddy request (or accept theirs if they already asked you)
router.post("/:username/buddy", requireLogin, async function (req, res) {
  const target = await findTarget(req, res);
  if (!target) return;
  const me = req.session.user;
  const row = await buddyRow(me.id, target.id);
  const notify = require("../notify").notify;
  if (row && row.status === "accepted") return res.json({ state: "buddies" });
  if (row && row.requester_id === me.id) return res.json({ state: "sent" });
  if (row) {
    await db.query("UPDATE buddies SET status = 'accepted', responded_at = NOW() WHERE id = $1", [row.id]);
    await notify(target.id, { type: "info", title: "🤝 " + (me.displayName || me.username) + " accepted your buddy request", body: "You're buddies now.", link: "/hub/people#buddies" });
    return res.json({ state: "buddies" });
  }
  try {
    await db.query("INSERT INTO buddies (requester_id, addressee_id) VALUES ($1, $2)", [me.id, target.id]);
  } catch (e) {
    if (e.code !== "23505") throw e;
  }
  await notify(target.id, { type: "info", title: "🤝 " + (me.displayName || me.username) + " sent you a buddy request", body: "Accept it to add @" + me.username + " to your buddy list.", link: "/hub/people#requests" });
  res.status(201).json({ state: "sent" });
});

// POST /api/users/:username/buddy/decline -> turn down a request sent to me
router.post("/:username/buddy/decline", requireLogin, async function (req, res) {
  const target = await findTarget(req, res);
  if (!target) return;
  await db.query("DELETE FROM buddies WHERE requester_id = $1 AND addressee_id = $2 AND status = 'pending'", [target.id, req.session.user.id]);
  res.json({ state: "none" });
});

// DELETE /api/users/:username/buddy -> cancel my request, or stop being buddies
router.delete("/:username/buddy", requireLogin, async function (req, res) {
  const target = await findTarget(req, res);
  if (!target) return;
  const row = await buddyRow(req.session.user.id, target.id);
  if (row && (row.status === "accepted" || row.requester_id === req.session.user.id)) await db.query("DELETE FROM buddies WHERE id = $1", [row.id]);
  res.json({ state: row && row.status !== "accepted" && row.requester_id !== req.session.user.id ? "received" : "none" });
});

router.get("/:username", requireLogin, async function (req, res) {
  const username = String(req.params.username || "").toLowerCase();
  if (!/^[a-z0-9_-]{3,30}$/.test(username)) {
    return res.status(404).json({ error: "That member could not be found." });
  }

  const { rows } = await db.query(
    `SELECT u.id, u.username, u.display_name, u.role, u.avatar_url, u.created_at, u.bio, u.profile_visible, u.streak_count, u.streak_best, u.status,
       (u.show_online AND u.last_seen_at > NOW() - INTERVAL '5 minutes') AS online,
       (SELECT COUNT(*) FROM comments c JOIN posts p ON p.id = c.post_id
         WHERE c.user_id = u.id AND (p.published AND p.review_status = 'approved' AND (p.publish_at IS NULL OR p.publish_at <= NOW())))::int AS comments,
       (SELECT COUNT(*) FROM likes l WHERE l.user_id = u.id)::int AS likes,
       (SELECT COUNT(*) FROM follows f WHERE f.creator_id = u.id)::int AS followers,
       (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id)::int AS following_count,
       EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.creator_id = u.id) AS i_follow,
       (SELECT CASE WHEN b.status = 'accepted' THEN 'buddies' WHEN b.requester_id = $2 THEN 'sent' ELSE 'received' END
          FROM buddies b WHERE LEAST(b.requester_id, b.addressee_id) = LEAST(u.id, $2) AND GREATEST(b.requester_id, b.addressee_id) = GREATEST(u.id, $2)) AS buddy_state,
       (SELECT COUNT(*) FROM buddies b WHERE (b.requester_id = u.id OR b.addressee_id = u.id) AND b.status = 'accepted')::int AS buddy_count
       FROM users u WHERE u.username = $1`,
    [username, req.session.user.id]
  );
  const user = rows[0];
  // Members who hid their page: only they (and the admin) can open it.
  if (user && !user.profile_visible && user.id !== req.session.user.id && req.session.user.role !== "admin") {
    return res.status(403).json({ error: "This member keeps their page private.", private: true });
  }
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
      bio: user.bio || "",
      ...(await require("../trust").badgesFor(user.id)),
      role: user.role,
      avatarUrl: avatarUrl(user.avatar_url),
      joined: user.created_at,
      comments: user.comments,
      likes: user.likes,
      online: !!user.online,
      streak: user.streak_count || 0,
      streakBest: user.streak_best || 0,
      banned: user.status === "banned",
      followers: user.followers,
      followingCount: user.following_count,
      iFollow: user.i_follow,
      buddyState: user.buddy_state || "none",
      buddies: user.buddy_count
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
