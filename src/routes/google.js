// src/routes/google.js
// "Continue with Google": sign up, log in, or link Google to the account you're logged in with.
//
// Turned on only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set (Render -> Environment).
//
// How it works (OAuth 2.0 / OpenID Connect):
//  1. /auth/google           -> we send the visitor to Google's sign-in page,
//                               with a random "state" and "nonce" saved in their session.
//  2. Google sends them back -> /auth/google/callback?code=...&state=...
//  3. We check state, swap the code for an ID token, and let the Google library
//     verify the token's signature, audience and nonce.
//  4. We find (or create) the account linked to that Google id and log them in.

const crypto = require("crypto");
const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const db = require("../db");
const { startSession, safeNext, publicUser } = require("../auth");

const router = express.Router();

function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

// The address Google sends people back to. It must be listed exactly like this
// in Google Cloud -> Credentials -> your OAuth client -> "Authorised redirect URIs".
function redirectUri(req) {
  const base = (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
  return base + "/auth/google/callback";
}

function client(req) {
  return new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: redirectUri(req)
  });
}

// Sends the visitor back with a short code the page turns into a message:
// to the profile page when they were linking, otherwise to the login page.
function fail(res, linking, code) {
  res.redirect((linking ? "/profile" : "/login") + "?google=" + code);
}

// Makes a username from the Google email, e.g. "Mwamba.Mulenga@gmail.com" -> "mwamba_mulenga".
async function makeUsername(email, name) {
  let base = String((email || "").split("@")[0] || name || "member")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  if (base.length < 3) base = (base + "_member").slice(0, 24);

  let candidate = base;
  for (let i = 0; i < 20; i++) {
    const { rows } = await db.query("SELECT 1 FROM users WHERE username = $1", [candidate]);
    if (!rows.length) return candidate;
    candidate = base.slice(0, 24) + "_" + crypto.randomInt(100, 9999);
  }
  return base.slice(0, 20) + "_" + crypto.randomBytes(3).toString("hex");
}

// Step 1: GET /auth/google?next=/work/abc   (add &link=1 to link Google to the logged-in account)
router.get("/", function (req, res) {
  const next = safeNext(req.query.next, "/profile");
  if (!googleEnabled()) {
    return fail(res, req.query.link === "1", "off");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const nonce = crypto.randomBytes(24).toString("hex");
  req.session.google = {
    state: state,
    nonce: nonce,
    next: next,
    link: req.query.link === "1" && Boolean(req.session.user)
  };

  const url = client(req).generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state: state,
    nonce: nonce,
    prompt: "select_account"
  });

  // Save the session before leaving the site, so the state is there when Google sends them back.
  req.session.save(function () {
    res.redirect(url);
  });
});

// Step 2-4: GET /auth/google/callback
router.get("/callback", async function (req, res) {
  const pending = req.session.google;
  delete req.session.google;
  const next = pending ? pending.next : "/profile";
  const linking = Boolean(pending && pending.link);

  if (!googleEnabled()) return fail(res, linking, "off");
  if (req.query.error) return fail(res, linking, "cancelled"); // e.g. they pressed Cancel on Google's page

  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const stateOk = pending && state.length === pending.state.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(pending.state));
  if (!stateOk || !code) {
    return fail(res, linking, "expired");
  }

  let profile;
  try {
    const oauth = client(req);
    const { tokens } = await oauth.getToken({ code: code, redirect_uri: redirectUri(req) });
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    profile = ticket.getPayload();
  } catch (error) {
    console.warn("Google sign-in failed:", error.message);
    return fail(res, linking, "failed");
  }

  if (!profile || !profile.sub || profile.nonce !== pending.nonce) {
    return fail(res, linking, "failed");
  }

  const email = profile.email_verified ? profile.email : null;
  const linked = await db.query("SELECT * FROM users WHERE google_sub = $1", [profile.sub]);

  // Linking Google to the account they're logged in with (from the profile page).
  if (pending.link && req.session.user) {
    if (linked.rows.length && linked.rows[0].id !== req.session.user.id) {
      return fail(res, linking, "taken");
    }
    await db.query("UPDATE users SET google_sub = $1, email = COALESCE($2, email) WHERE id = $3",
      [profile.sub, email, req.session.user.id]);
    return res.redirect(safeNext(next, "/profile").split("?")[0] + "?google=linked");
  }

  let user = linked.rows[0];

  // First time with this Google account: create a member account.
  if (!user) {
    const username = await makeUsername(profile.email, profile.name);
    const displayName = String(profile.name || username).slice(0, 60);
    const created = await db.query(
      "INSERT INTO users (username, display_name, password_hash, role, google_sub, email) VALUES ($1, $2, NULL, 'member', $3, $4) RETURNING *",
      [username, displayName, profile.sub, email]
    );
    user = created.rows[0];
  }

  await startSession(req, user);
  res.redirect(next);
});

module.exports = { router, googleEnabled, publicUser };
