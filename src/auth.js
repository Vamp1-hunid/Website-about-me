// src/auth.js
// Small "gatekeeper" functions (middleware) that routes use to check who is asking.

// Only lets the request through if someone is logged in.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Create a free account or log in to do that.", signup: true });
  }
  next();
}

// Only lets the request through if the logged-in person is the admin (Mwamba).
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in first." });
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Only the site owner can do that." });
  }
  next();
}

// Only lets the request through for the admin or an approved Chapterhive creator.
// Sets req.creator = { userId, handle, status, canWriteNews } and req.isAdmin.
async function requireCreator(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in first." });
  }
  const db = require("./db");
  const { rows } = await db.query(
    "SELECT handle, status, can_write_news FROM creator_profiles WHERE user_id = $1",
    [req.session.user.id]
  );
  const profile = rows[0];
  req.isAdmin = req.session.user.role === "admin";
  if (!req.isAdmin && (!profile || profile.status !== "approved")) {
    return res.status(403).json({
      error: profile && profile.status === "pending"
        ? "Your creator application is still being reviewed."
        : "Only approved Chapterhive creators can do that. Apply at /hub/apply."
    });
  }
  req.creator = {
    userId: req.session.user.id,
    handle: profile ? profile.handle : null,
    status: profile ? profile.status : "approved",
    canWriteNews: req.isAdmin || Boolean(profile && profile.can_write_news)
  };
  next();
}

// Runs on every API request from a logged-in person, at most once a minute each:
// records that they're online, keeps their daily streak, and signs out banned or
// suspended accounts straight away.
async function trackActivity(req, res, next) {
  const user = req.session && req.session.user;
  if (!user) return next();
  const now = Date.now();
  if (req.session.touchedAt && now - req.session.touchedAt < 60000) return next();
  req.session.touchedAt = now;
  const users = require("./users");
  const row = await users.touch(user.id);
  const blocked = row ? users.standingProblem(row) : "Your account no longer exists.";
  if (blocked) {
    return req.session.destroy(function () {
      res.clearCookie("mm.sid");
      res.status(403).json({ error: blocked, signedOut: true });
    });
  }
  next();
}

// Blocks form posts sent from other websites (cross-site request forgery).
// Browsers always add an Origin header to cross-site POST/PUT/DELETE requests,
// so if it is present it must match this site.
function sameOriginOnly(req, res, next) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }
  const origin = req.get("origin");
  if (!origin) {
    return next();
  }
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch (error) {
    return res.status(403).json({ error: "Request blocked." });
  }
  if (originHost !== req.get("host")) {
    return res.status(403).json({ error: "Request blocked." });
  }
  next();
}

// The details about a user that are safe to send to the browser (never the password hash).
function publicUser(row) {
  const { avatarUrl } = require("./storage");
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: avatarUrl(row.avatar_url) || null
  };
}

// Logs a user in by saving them in the session.
// regenerate() gives the visitor a brand-new session id, which stops "session fixation" attacks.
function startSession(req, user) {
  return new Promise(function (resolve, reject) {
    req.session.regenerate(function (error) {
      if (error) return reject(error);
      req.session.user = publicUser(user);
      req.session.save(function (saveError) {
        if (saveError) return reject(saveError);
        resolve();
      });
    });
  });
}

// Only allow redirects to pages on this site (stops "?next=https://evil.example").
function safeNext(value, fallback) {
  if (typeof value === "string" && value.charAt(0) === "/" && value.charAt(1) !== "/" && value.indexOf("\\") === -1) {
    return value;
  }
  return fallback || "/";
}

module.exports = { requireLogin, requireAdmin, requireCreator, trackActivity, sameOriginOnly, publicUser, startSession, safeNext };
