// src/auth.js
// Small "gatekeeper" functions (middleware) that routes use to check who is asking.

// Only lets the request through if someone is logged in.
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Please log in first." });
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
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role
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

module.exports = { requireLogin, requireAdmin, sameOriginOnly, publicUser, startSession, safeNext };
