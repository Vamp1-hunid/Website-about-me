// src/users.js
// Shared account rules: usernames (taken or reserved), account standing (banned / suspended),
// welcome messages, online streaks and follower milestones.

const db = require("./db");
const { notify } = require("./notify");

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

// Names nobody can register, so no one can pretend to be the site or its staff.
const RESERVED = new Set([
  "admin", "administrator", "admins", "root", "system", "sysadmin", "mod", "mods", "moderator", "moderators",
  "staff", "team", "official", "support", "help", "helpdesk", "info", "contact", "security", "abuse", "billing",
  "sponsor", "sponsors", "owner", "founder", "ceo", "api", "www", "mail", "email", "noreply", "no_reply",
  "null", "undefined", "anonymous", "anon", "everyone", "here", "test", "testing",
  "chapterhive", "chapter_hive", "chapterhive_official", "afterframe", "after_frame", "godsbanditos", "gods_banditos", "god_s_banditos", "banditos",
  "mulenga", "mulenga_mwamba", "mwamba_official", "hub", "studio", "dashboard", "settings", "profile", "login",
  "register", "signup", "logout", "feed", "news", "creators", "collabs", "legal", "terms", "privacy"
]);

function isReserved(name) {
  const plain = String(name || "").toLowerCase();
  if (RESERVED.has(plain)) return true;
  // Also block obvious disguises such as "admin_123" or "official_chapterhive".
  return /^(admin|moderator|mod|staff|support|official)(_|\d|$)/.test(plain) || /(chapterhive|chapter_hive|afterframe|godsbanditos|gods_banditos)/.test(plain);
}

// Returns null if the username can be used, otherwise a friendly reason.
async function usernameProblem(name, ignoreUserId, claimToken) {
  const username = String(name || "").trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return "Use 3–30 lowercase letters, numbers or underscores.";
  if (isReserved(username)) return "That username is reserved. Please choose another.";
  const { rows } = await db.query(
    "SELECT 1 FROM users WHERE LOWER(username) = $1 AND ($2::int IS NULL OR id <> $2)",
    [username, ignoreUserId || null]
  );
  if (rows.length) return "That username is already taken.";
  // Reserved before launch by someone else (the reserver claims it with their link).
  const held = await db.query("SELECT claim_token FROM username_reservations WHERE username = $1 AND claimed_at IS NULL", [username]);
  if (held.rows.length && held.rows[0].claim_token !== claimToken) return "That username has been reserved by someone.";
  return null;
}

// null if the account may be used; otherwise the reason it can't.
function standingProblem(row) {
  if (!row) return null;
  if (row.status === "banned") {
    return "This account has been banned" + (row.status_reason ? ": " + row.status_reason : ".") + " If you think this is a mistake, use the contact page.";
  }
  if (row.status === "suspended" && (!row.suspended_until || new Date(row.suspended_until) > new Date())) {
    return "This account is suspended" + (row.suspended_until ? " until " + new Date(row.suspended_until).toUTCString().replace(/:\d\d GMT/, " GMT") : "") +
      (row.status_reason ? ". Reason: " + row.status_reason : ".");
  }
  return null;
}

const WELCOME = {
  member: {
    title: "Welcome to Chapterhive 🐝",
    body: "Brought to you by God's Banditos.\nYou can now like, save and comment, follow creators, chat and get new releases in your bell. " +
      "Your feed learns what you enjoy: tap ⋯ on any post to see more or less like it. Want to publish your own work? Apply to become a creator.",
    link: "/help"
  },
  creator: {
    title: "You're in: welcome to the Chapterhive creators! 🐝",
    body: "Your studio is ready. Post art, stories, comics, films, memes, polls or how you're feeling. " +
      "Every post is checked by the team before it goes public (usually quickly). Set up your profile banner and bio first so new followers know who you are.",
    link: "/hub/studio"
  },
  admin: {
    title: "Welcome, site owner",
    body: "Your dashboard has everything: reviews, Manage users, Features (test things before everyone sees them) and announcements.",
    link: "/admin"
  }
};

async function welcome(userId, kind) {
  const w = WELCOME[kind] || WELCOME.member;
  await notify(userId, { type: "welcome", title: w.title, body: w.body, link: w.link });
}

// Called on activity (at most once a minute per person): online time + daily streak.
async function touch(userId) {
  const { rows } = await db.query(
    `UPDATE users SET
       last_seen_at = NOW(),
       streak_count = CASE
         WHEN streak_day = CURRENT_DATE THEN streak_count
         WHEN streak_day = CURRENT_DATE - 1 THEN streak_count + 1
         ELSE 1 END,
       streak_day = CURRENT_DATE
     WHERE id = $1
     RETURNING status, suspended_until, status_reason, streak_count, streak_best`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;
  if (row.streak_count > row.streak_best) {
    await db.query("UPDATE users SET streak_best = $1 WHERE id = $2", [row.streak_count, userId]);
    if ([3, 7, 14, 30, 50, 100, 200, 365].includes(row.streak_count)) {
      await notify(userId, {
        type: "streak",
        title: "🔥 " + row.streak_count + "-day streak!",
        body: "You've visited " + row.streak_count + " days in a row. Keep it going!",
        link: "/profile"
      });
    }
  }
  return row;
}

const MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

// After someone gains a follower: celebrate round numbers.
async function followerMilestone(creatorId, count) {
  if (!MILESTONES.includes(count)) return;
  await notify(creatorId, {
    type: "milestone",
    title: count === 1 ? "🎉 Your first follower!" : "🎉 " + count.toLocaleString("en-GB") + " followers!",
    body: count === 1
      ? "Someone wants to see everything you make next. Keep going!"
      : "You just reached " + count.toLocaleString("en-GB") + " followers on Chapterhive. Congratulations!",
    link: "/hub/studio"
  });
}

module.exports = { USERNAME_PATTERN, RESERVED, isReserved, usernameProblem, standingProblem, welcome, touch, followerMilestone };
