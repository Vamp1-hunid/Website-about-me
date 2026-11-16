// src/routes/account.js
// Register, log in, log out, "who am I?", my favourites, and delete my account.

const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireLogin, startSession, publicUser } = require("../auth");
const { googleEnabled } = require("./google");
const crypto = require("crypto");
const { thumbnailUrl, upload, saveImage, deleteImage, avatarUrl } = require("../storage");
const { mailEnabled, sendMail } = require("../mail");
const users = require("../users");
const flags = require("../flags");
const signup = require("../signup");
const interests = require("../interests");

const router = express.Router();

// Slow down password guessing: at most 10 login attempts per 15 minutes per visitor.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.SIGNUP_LIMIT_PER_HOUR) || 5,
  skipFailedRequests: true, // typos in the form don't use up the allowance
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many new accounts from this connection. Please try again later." }
});

const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const EMAIL_PATTERN = /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[^\s@<>"]{2,}$/;

// A hash of a random password, checked when the username does not exist.
const DUMMY_HASH = bcrypt.hashSync(require("crypto").randomBytes(16).toString("hex"), 12);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// POST /api/account/register  { username, displayName, password }
// People claiming a reserved username can join even while new accounts are switched off.
async function signupsOrClaim(req, res, next) {
  const token = typeof req.body.claimToken === "string" ? req.body.claimToken : "";
  if (token) {
    const r = await db.query("SELECT 1 FROM username_reservations WHERE claim_token = $1 AND claimed_at IS NULL", [token]);
    if (r.rows.length) return next();
  }
  return flags.requireFlag("signups")(req, res, next);
}

router.post("/register", signupsOrClaim, registerLimiter, async function (req, res) {
  const username = cleanText(req.body.username).toLowerCase();
  const displayName = cleanText(req.body.displayName) || username;
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const email = cleanText(req.body.email).toLowerCase();
  const birth = signup.checkBirthDate(req.body.birthDate);
  const country = signup.checkCountry(req.body.country);
  const gender = signup.checkGender(req.body.gender);

  const problems = [];
  // Under-13s are turned away before anything else is checked, and nothing about them is stored.
  if (birth.tooYoung) {
    return res.status(403).json({ error: birth.problem, tooYoung: true, problems: [{ field: "birthDate", message: birth.problem }] });
  }
  if (birth.problem) problems.push({ field: "birthDate", message: birth.problem });
  if (!country) problems.push({ field: "country", message: "Choose the country you live in." });
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    problems.push({ field: "email", message: "Enter a working email address. It's used to verify your account and reset your password." });
  } else {
    const used = await db.query("SELECT 1 FROM users WHERE lower(email) = $1", [email]);
    if (used.rows.length) problems.push({ field: "email", message: "That email already has an account. Log in or reset your password instead." });
  }
  const claimToken = typeof req.body.claimToken === "string" ? req.body.claimToken : undefined;
  const usernameIssue = await users.usernameProblem(username, null, claimToken);
  if (usernameIssue) {
    problems.push({ field: "username", message: usernameIssue });
  }
  if (displayName.length > 60) {
    problems.push({ field: "displayName", message: "Display name must be 60 characters or fewer." });
  }
  const passwordIssue = signup.passwordProblem(password, username);
  if (passwordIssue) problems.push({ field: "password", message: passwordIssue });
  if (req.body.acceptTerms !== true) {
    problems.push({ field: "acceptTerms", message: "Please accept the Terms of Service and Privacy Policy." });
  }
  if (problems.length) {
    const taken = problems.some(function (p) { return p.field === "username" && /taken|reserved/.test(p.message); });
    return res.status(taken && problems.length === 1 ? 409 : 400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (username, display_name, password_hash, role, email, terms_accepted_at, terms_version, birth_date, country, marketing_opt_in, gender)
     VALUES ($1, $2, $3, 'member', $4, NOW(), $5, $6, $7, $8, $9) RETURNING *`,
    [username, displayName, hash, email, signup.TERMS_VERSION, birth.date, country, req.body.marketing === true, gender]
  );

  await users.welcome(rows[0].id, "member");
  if (claimToken) {
    // The reserved name is now a real account. If they claimed with the same email, it's already confirmed.
    const claimed = await db.query("UPDATE username_reservations SET claimed_at = NOW() WHERE claim_token = $1 AND username = $2 RETURNING email", [claimToken, username]);
    if (claimed.rows[0] && claimed.rows[0].email === email) {
      await db.query("UPDATE users SET email_verified_at = NOW() WHERE id = $1", [rows[0].id]);
      rows[0].email_verified_at = new Date();
    }
  }
  sendVerification(req, rows[0]).catch(function () { /* email is optional to deliver */ });
  await startSession(req, rows[0]);
  res.status(201).json({ user: req.session.user });
});

/* ---------- Feed personalisation: welcome survey and "see more / less" ---------- */

const SURVEY_CATEGORIES = ["novel", "storybook", "educational", "poetry", "song", "story-art", "art", "anime", "film", "series",
  "trailer", "writing", "comedy", "meme", "thoughts", "tutorial"];
const SURVEY_GENRES = ["fantasy", "scifi", "horror", "mystery", "romance", "comedy", "drama", "action", "adventure", "thriller",
  "slice-of-life", "historical", "children", "young-adult", "education", "science", "self-help", "faith", "poetry", "music"];

router.get("/interests", requireLogin, async function (req, res) {
  const { rows } = await db.query("SELECT onboarded_at FROM users WHERE id = $1", [req.session.user.id]);
  res.json({ interests: await interests.list(req.session.user.id), onboarded: Boolean(rows[0] && rows[0].onboarded_at) });
});

// PUT /api/account/interests { categories: [], genres: [] }  (the welcome survey; can be retaken later)
router.put("/interests", requireLogin, async function (req, res) {
  const cats = (Array.isArray(req.body.categories) ? req.body.categories : []).filter(function (c) { return SURVEY_CATEGORIES.includes(c); });
  const gens = (Array.isArray(req.body.genres) ? req.body.genres : []).filter(function (g) { return SURVEY_GENRES.includes(g); });
  const id = req.session.user.id;
  // Retaking the survey replaces earlier survey-level picks but keeps what was learned from likes and feedback.
  for (const c of cats) await db.query(
    `INSERT INTO user_interests (user_id, kind, key, weight) VALUES ($1, 'category', $2, 4)
     ON CONFLICT (user_id, kind, key) DO UPDATE SET weight = GREATEST(user_interests.weight, 4), updated_at = NOW()`, [id, c]);
  for (const g of gens) await db.query(
    `INSERT INTO user_interests (user_id, kind, key, weight) VALUES ($1, 'genre', $2, 4)
     ON CONFLICT (user_id, kind, key) DO UPDATE SET weight = GREATEST(user_interests.weight, 4), updated_at = NOW()`, [id, g]);
  await db.query("UPDATE users SET onboarded_at = COALESCE(onboarded_at, NOW()) WHERE id = $1", [id]);
  res.json({ ok: true, interests: await interests.list(id) });
});

// POST /api/account/onboarded -> finished (or skipped) the welcome
router.post("/onboarded", requireLogin, async function (req, res) {
  await db.query("UPDATE users SET onboarded_at = COALESCE(onboarded_at, NOW()) WHERE id = $1", [req.session.user.id]);
  res.json({ ok: true });
});

// POST /api/account/interests/feedback { postId, more: true|false }
router.post("/interests/feedback", requireLogin, async function (req, res) {
  const postId = Number(req.body.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Which post?" });
  await interests.fromPost(req.session.user.id, postId, req.body.more === true ? 3 : -4);
  res.json({ ok: true });
});

// DELETE /api/account/interests -> start the feed over
router.delete("/interests", requireLogin, async function (req, res) {
  await db.query("DELETE FROM user_interests WHERE user_id = $1", [req.session.user.id]);
  res.json({ ok: true });
});

/* ---------- Organisation / group accounts ---------- */

const ORG_TYPES = { publisher: "Publisher", studio: "Studio", school: "School or university", band: "Band or music group",
  collective: "Creative collective", ngo: "Non-profit / NGO", company: "Company or brand", church: "Church or faith group", other: "Other group" };

function cleanTeam(value) {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 30).map(function (m) {
    return {
      name: cleanText(m && m.name).slice(0, 80),
      role: cleanText(m && m.role).slice(0, 80),
      username: cleanText(m && m.username).toLowerCase().replace(/^@/, "").slice(0, 30)
    };
  }).filter(function (m) { return m.name; });
}

function orgProblems(body) {
  const problems = [];
  const org = {
    name: cleanText(body.orgName).slice(0, 100),
    type: Object.prototype.hasOwnProperty.call(ORG_TYPES, body.orgType) ? body.orgType : null,
    website: cleanText(body.website).slice(0, 300),
    contactName: cleanText(body.contactName).slice(0, 80),
    contactRole: cleanText(body.contactRole).slice(0, 80),
    team: cleanTeam(body.team)
  };
  if (org.name.length < 2) problems.push({ field: "orgName", message: "Enter your organisation or group's name." });
  if (!org.type) problems.push({ field: "orgType", message: "Choose what kind of organisation it is." });
  if (org.website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(org.website)) problems.push({ field: "website", message: "Use a full web address starting with https://" });
  if (org.contactName.length < 2) problems.push({ field: "contactName", message: "Enter the name of the person responsible for this account." });
  return { org: org, problems: problems };
}

// POST /api/account/register-org  { username, email, password, birthDate (of the contact person), country,
//                                   orgName, orgType, website, contactName, contactRole, team[], acceptTerms, confirmAuthority }
// One shared account for a group. The person signing up must be 18+ and allowed to act for the organisation.
router.post("/register-org", flags.requireFlag("signups"), registerLimiter, async function (req, res) {
  const username = cleanText(req.body.username).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const email = cleanText(req.body.email).toLowerCase();
  const birth = signup.checkBirthDate(req.body.birthDate);
  const country = signup.checkCountry(req.body.country);
  const { org, problems } = orgProblems(req.body);

  if (birth.problem) problems.push({ field: "birthDate", message: birth.problem });
  else if (birth.age < signup.ADULT_AGE) problems.push({ field: "birthDate", message: "The person running an organisation account must be 18 or older." });
  if (!country) problems.push({ field: "country", message: "Choose the country the organisation is based in." });
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    problems.push({ field: "email", message: "Enter the organisation's contact email." });
  } else if ((await db.query("SELECT 1 FROM users WHERE lower(email) = $1", [email])).rows.length) {
    problems.push({ field: "email", message: "That email already has an account." });
  }
  const usernameIssue = await users.usernameProblem(username);
  if (usernameIssue) problems.push({ field: "username", message: usernameIssue });
  const passwordIssue = signup.passwordProblem(password, username);
  if (passwordIssue) problems.push({ field: "password", message: passwordIssue });
  if (req.body.acceptTerms !== true) problems.push({ field: "acceptTerms", message: "Please accept the Terms of Service and Privacy Policy." });
  if (req.body.confirmAuthority !== true) problems.push({ field: "confirmAuthority", message: "Please confirm you're allowed to create this account for the organisation." });
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  const hash = await bcrypt.hash(password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (username, display_name, password_hash, role, email, terms_accepted_at, terms_version, birth_date, country,
                        marketing_opt_in, account_type)
     VALUES ($1, $2, $3, 'member', $4, NOW(), $5, $6, $7, $8, 'organisation') RETURNING *`,
    [username, org.name.slice(0, 60), hash, email, signup.TERMS_VERSION, birth.date, country, req.body.marketing === true]);
  await db.query(
    "INSERT INTO organisations (user_id, org_name, org_type, website, contact_name, contact_role, team) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [rows[0].id, org.name, org.type, org.website, org.contactName, org.contactRole, JSON.stringify(org.team)]);
  await users.welcome(rows[0].id, "member");
  sendVerification(req, rows[0]).catch(function () { /* optional */ });
  await startSession(req, rows[0]);
  res.status(201).json({ user: req.session.user });
});

// GET /api/account/organisation  -> my organisation details (organisation accounts only)
router.get("/organisation", requireLogin, async function (req, res) {
  const { rows } = await db.query("SELECT * FROM organisations WHERE user_id = $1", [req.session.user.id]);
  if (!rows.length) return res.status(404).json({ error: "This isn't an organisation account." });
  const o = rows[0];
  res.json({ organisation: { orgName: o.org_name, orgType: o.org_type, website: o.website, contactName: o.contact_name,
    contactRole: o.contact_role, team: o.team }, types: ORG_TYPES });
});

// PUT /api/account/organisation  -> update the organisation details and team list
router.put("/organisation", requireLogin, async function (req, res) {
  const exists = await db.query("SELECT 1 FROM organisations WHERE user_id = $1", [req.session.user.id]);
  if (!exists.rows.length) return res.status(404).json({ error: "This isn't an organisation account." });
  const { org, problems } = orgProblems(req.body);
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  await db.query(
    "UPDATE organisations SET org_name = $1, org_type = $2, website = $3, contact_name = $4, contact_role = $5, team = $6 WHERE user_id = $7",
    [org.name, org.type, org.website, org.contactName, org.contactRole, JSON.stringify(org.team), req.session.user.id]);
  res.json({ ok: true });
});

// GET /api/account/org-types
router.get("/org-types", function (req, res) { res.json({ types: ORG_TYPES }); });

// GET /api/account/username-available?u=name  -> { available, message }  (checked live while typing)
router.get("/username-available", async function (req, res) {
  const problem = await users.usernameProblem(typeof req.query.u === "string" ? req.query.u : req.query.username);
  res.json({ available: !problem, message: problem || "That username is available." });
});

// POST /api/account/google-complete { acceptTerms, username }
// A first-time Google sign-in waits here until the person has accepted the terms.
router.post("/google-complete", flags.requireFlag("signups"), registerLimiter, async function (req, res) {
  const pending = req.session.pendingGoogle;
  if (!pending) return res.status(400).json({ error: "Your Google sign-in expired. Please press Continue with Google again." });
  if (req.body.acceptTerms !== true) {
    return res.status(400).json({ error: "Please accept the terms to create your account.", problems: [{ field: "acceptTerms", message: "Please accept the Terms of Service and Privacy Policy." }] });
  }
  const birth = signup.checkBirthDate(req.body.birthDate);
  const country = signup.checkCountry(req.body.country);
  if (birth.tooYoung) {
    delete req.session.pendingGoogle;
    return res.status(403).json({ error: birth.problem, tooYoung: true, problems: [{ field: "birthDate", message: birth.problem }] });
  }
  const early = [];
  if (birth.problem) early.push({ field: "birthDate", message: birth.problem });
  if (!country) early.push({ field: "country", message: "Choose the country you live in." });
  if (early.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: early });
  const username = cleanText(req.body.username).toLowerCase() || pending.username;
  const issue = await users.usernameProblem(username);
  if (issue) return res.status(400).json({ error: issue, problems: [{ field: "username", message: issue }] });
  const already = await db.query("SELECT 1 FROM users WHERE google_sub = $1", [pending.sub]);
  if (already.rows.length) return res.status(409).json({ error: "This Google account already has an account. Log in instead." });
  const { rows } = await db.query(
    `INSERT INTO users (username, display_name, password_hash, role, google_sub, email, terms_accepted_at, terms_version,
                        birth_date, country, marketing_opt_in, email_verified_at, gender)
     VALUES ($1, $2, NULL, 'member', $3, $4, NOW(), $5, $6, $7, $8, NOW(), $9) RETURNING *`,
    [username, pending.displayName, pending.sub, pending.email, signup.TERMS_VERSION, birth.date, country, req.body.marketing === true, signup.checkGender(req.body.gender)]
  );
  const next = pending.next || "/hub";
  delete req.session.pendingGoogle;
  await users.welcome(rows[0].id, "member");
  await startSession(req, rows[0]);
  res.status(201).json({ user: req.session.user, next: next });
});

// GET /api/account/google-pending -> the Google details waiting for terms acceptance (or null)
router.get("/google-pending", function (req, res) {
  const p = req.session.pendingGoogle;
  res.json({ pending: p ? { email: p.email, displayName: p.displayName, username: p.username } : null });
});

// POST /api/account/login  { username, password }
router.post("/login", loginLimiter, async function (req, res) {
  const username = cleanText(req.body.username).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";

  const { rows } = await db.query("SELECT * FROM users WHERE username = $1", [username]);
  const user = rows[0];

  // Same message (and roughly the same time) whether the username or the password
  // is wrong, so nobody can use the form to find out which usernames exist.
  const ok = await bcrypt.compare(password, user && user.password_hash ? user.password_hash : DUMMY_HASH);
  if (!ok) {
    const googleOnly = user && !user.password_hash && user.google_sub;
    return res.status(401).json({
      error: googleOnly
        ? "This account uses Google sign-in. Press \"Continue with Google\" instead."
        : "Wrong username or password."
    });
  }

  // The God's Banditos login is only for the site owner; members sign in on Chapterhive.
  // Before launch (reservations on, new accounts off) only the team can log in: the admin and beta testers.
  if (user.role !== "admin" && !user.is_beta && (await flags.isOn("reservations", req)) && !(await flags.isOn("signups", req))) {
    return res.status(403).json({ error: "Chapterhive isn't open yet. Logging in is only for the Chapterhive team while we test things before launch. You can reserve your username now.", prelaunch: true });
  }
  if (req.body.adminOnly === true && user.role !== "admin") {
    return res.status(403).json({ error: "This login is only for the site owner. Members log in on Chapterhive.", hub: "/hub/login" });
  }

  const blocked = users.standingProblem(user);
  if (blocked) return res.status(403).json({ error: blocked });

  await startSession(req, user);
  res.json({ user: req.session.user });
});

// PUT /api/account/presence { showOnline }  -> show or hide your green "online" dot
router.put("/presence", requireLogin, async function (req, res) {
  const showOnline = req.body.showOnline !== false;
  await db.query("UPDATE users SET show_online = $1 WHERE id = $2", [showOnline, req.session.user.id]);
  res.json({ showOnline: showOnline });
});

// POST /api/account/logout
router.post("/logout", function (req, res) {
  req.session.destroy(function () {
    res.clearCookie("mm.sid");
    res.json({ ok: true });
  });
});

// GET /api/account/me  -> { user } or { user: null }
router.get("/me", async function (req, res) {
  let creator = null;
  if (req.session.user) {
    const { rows } = await db.query(
      "SELECT handle, status, can_write_news FROM creator_profiles WHERE user_id = $1",
      [req.session.user.id]
    );
    if (rows[0]) creator = { handle: rows[0].handle, status: rows[0].status, canWriteNews: rows[0].can_write_news };
  }
  let extra = {};
  if (req.session.user) {
    const { rows } = await db.query(
      "SELECT show_online, streak_count, streak_best, is_beta, birth_date, country, email, email_verified_at, chat_privacy, gender, account_type, onboarded_at, created_at, daily_verse FROM users WHERE id = $1",
      [req.session.user.id]
    );
    if (rows[0]) {
      extra = { showOnline: rows[0].show_online, streak: rows[0].streak_count, streakBest: rows[0].streak_best, isBeta: rows[0].is_beta,
        account: {
          hasBirthDate: Boolean(rows[0].birth_date), country: rows[0].country || null,
          teen: rows[0].birth_date ? signup.isMinor(rows[0].birth_date) : null,
          hasEmail: Boolean(rows[0].email), emailVerified: Boolean(rows[0].email_verified_at), chatPrivacy: rows[0].chat_privacy,
          gender: rows[0].gender || null, accountType: rows[0].account_type, dailyVerse: rows[0].daily_verse,
          // New accounts (made in the last 7 days) that haven't been through the welcome yet.
          needsWelcome: !rows[0].onboarded_at && (Date.now() - new Date(rows[0].created_at)) < 7 * 86400000
        } };
    }
  }
  const flagUser = req.session.user ? Object.assign({}, req.session.user, { is_beta: extra.isBeta }) : null;
  const features = await flags.enabledFor(flagUser);
  const featureNotices = await flags.noticesFor(flagUser);
  res.json(Object.assign({
    user: req.session.user || null, creator: creator, googleEnabled: googleEnabled(), mailEnabled: mailEnabled(),
    features: features, featureNotices: featureNotices
  }, extra));
});

/* ---------- Email verification ---------- */

async function sendVerification(req, user) {
  if (!user.email || user.email_verified_at || !mailEnabled()) return false;
  const token = crypto.randomBytes(24).toString("hex");
  await db.query("UPDATE users SET email_verify_token = $1 WHERE id = $2", [token, user.id]);
  const base = (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
  const link = base + "/hub/verify?token=" + token;
  await sendMail(user.email, "Confirm your Chapterhive email",
    "Hi " + user.display_name + ",\n\nPlease confirm this is your email address by opening this link:\n" + link +
    "\n\nIf you didn't create an account, you can ignore this email.",
    "<p>Hi " + escapeHtml(user.display_name) + ",</p><p>Please confirm this is your email address:</p><p><a href=\"" + link + "\">Confirm my email</a></p><p>If you didn't create an account, you can ignore this email.</p>");
  return true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]; });
}

const verifyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many emails. Please try again later." } });

// POST /api/account/verify/send  -> sends (again) the confirmation link
router.post("/verify/send", requireLogin, verifyLimiter, async function (req, res) {
  const { rows } = await db.query("SELECT * FROM users WHERE id = $1", [req.session.user.id]);
  if (!rows[0].email) return res.status(400).json({ error: "Add an email address first." });
  if (rows[0].email_verified_at) return res.json({ ok: true, already: true });
  if (!mailEnabled()) return res.status(503).json({ error: "Email isn't set up on this site yet." });
  await sendVerification(req, rows[0]);
  res.json({ ok: true });
});

// POST /api/account/verify { token }
router.post("/verify", async function (req, res) {
  const token = typeof req.body.token === "string" ? req.body.token : "";
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: "That link isn't valid." });
  const { rows } = await db.query(
    "UPDATE users SET email_verified_at = NOW(), email_verify_token = NULL WHERE email_verify_token = $1 RETURNING id", [token]);
  if (!rows.length) return res.status(400).json({ error: "That link has expired or was already used." });
  res.json({ ok: true });
});

/* ---------- Privacy settings (Settings page) ---------- */

// GET /api/account/privacy
router.get("/privacy", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    `SELECT u.show_online, u.chat_privacy, u.profile_visible, u.max_rating, u.hide_strong_language, u.daily_verse, u.birth_date,
            u.school_email, u.school_verified_at, cp.post_visibility, cp.status AS creator_status
       FROM users u LEFT JOIN creator_profiles cp ON cp.user_id = u.id WHERE u.id = $1`, [req.session.user.id]);
  const r = rows[0];
  res.json({ showOnline: r.show_online, chatPrivacy: r.chat_privacy, profileVisible: r.profile_visible,
    postVisibility: r.post_visibility || null, isCreator: Boolean(r.creator_status),
    maxRating: r.max_rating, hideStrongLanguage: r.hide_strong_language, dailyVerse: r.daily_verse,
    adult: Boolean(r.birth_date) && !signup.isMinor(r.birth_date),
    school: { email: r.school_email || null, verified: Boolean(r.school_verified_at) } });
});

/* ---------- Skills (shown under the bio) ---------- */
const SKILLS = ["Writer", "Novelist", "Poet", "Screenwriter", "Voice actor", "Narrator", "Singer", "Songwriter", "Musician", "Producer",
  "Rapper", "Illustrator", "Comic artist", "Manga artist", "Animator", "Painter", "Photographer", "Filmmaker", "Actor", "Editor",
  "Translator", "Teacher", "Graphic designer", "Game designer", "Storyboard artist", "Colourist", "Letterer", "Sound designer"];
router.get("/skills", requireLogin, async function (req, res) {
  const { rows } = await db.query("SELECT skills FROM users WHERE id = $1", [req.session.user.id]);
  res.json({ skills: rows[0].skills || [], options: SKILLS });
});
router.put("/skills", requireLogin, async function (req, res) {
  const picked = (Array.isArray(req.body.skills) ? req.body.skills : []).filter(function (s, i, all) { return SKILLS.includes(s) && all.indexOf(s) === i; }).slice(0, 8);
  await db.query("UPDATE users SET skills = $1 WHERE id = $2", [picked, req.session.user.id]);
  res.json({ skills: picked });
});

/* ---------- Student verification ---------- */
// A school email looks like name@something.edu, .edu.xx, .ac.xx, .sch.xx or .school.
function looksLikeSchool(email) {
  const domain = email.split("@")[1] || "";
  return /(^|\.)(edu|ac|sch|school|college|university|uni)(\.[a-z]{2,3})?$/.test(domain) || /\.edu\.[a-z]{2}$/.test(domain) || /\.ac\.[a-z]{2}$/.test(domain);
}
const schoolLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false,
  message: { error: "Too many tries. Please wait a while." } });
// POST /api/account/school { email } -> sends a confirmation link to the school address
router.post("/school", requireLogin, schoolLimiter, async function (req, res) {
  const email = cleanText(req.body.email).toLowerCase();
  if (!EMAIL_PATTERN.test(email) || !looksLikeSchool(email)) {
    return res.status(400).json({ error: "Use your school or university email (for example name@unza.zm, name@school.edu or name@mu.ac.zm).", problems: [{ field: "schoolEmail", message: "That doesn't look like a school email." }] });
  }
  if (!mailEnabled()) return res.status(503).json({ error: "Email isn't set up on this site yet, so school emails can't be checked right now." });
  const token = crypto.randomBytes(24).toString("hex");
  await db.query("UPDATE users SET school_email = $1, school_token = $2, school_verified_at = NULL WHERE id = $3", [email, token, req.session.user.id]);
  const base = (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
  const link = base + "/hub/verify?school=" + token;
  await sendMail(email, "Confirm your student email on Chapterhive",
    "Open this link to confirm you're a student and get your verified-student badge:\n" + link,
    "<p>Open this link to confirm you're a student and get your 🎓 verified-student badge:</p><p><a href=\"" + link + "\">Confirm my school email</a></p>");
  res.json({ ok: true });
});
// POST /api/account/school/verify { token }
router.post("/school/verify", async function (req, res) {
  const token = typeof req.body.token === "string" ? req.body.token : "";
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: "That link isn't valid." });
  const { rows } = await db.query("UPDATE users SET school_verified_at = NOW(), school_token = NULL WHERE school_token = $1 RETURNING id", [token]);
  if (!rows.length) return res.status(400).json({ error: "That link has expired or was already used." });
  res.json({ ok: true });
});

// Content filter and daily verse live with the privacy settings.
// PUT /api/account/privacy { showOnline, chatPrivacy, profileVisible, postVisibility, maxRating, hideStrongLanguage, dailyVerse }
router.put("/privacy", requireLogin, async function (req, res) {
  const id = req.session.user.id;
  if (typeof req.body.showOnline === "boolean") await db.query("UPDATE users SET show_online = $1 WHERE id = $2", [req.body.showOnline, id]);
  if (["everyone", "following", "nobody"].includes(req.body.chatPrivacy)) await db.query("UPDATE users SET chat_privacy = $1 WHERE id = $2", [req.body.chatPrivacy, id]);
  if (typeof req.body.profileVisible === "boolean") await db.query("UPDATE users SET profile_visible = $1 WHERE id = $2", [req.body.profileVisible, id]);
  if (["all", "teen", "mature"].includes(req.body.maxRating)) {
    // Mature (18+) can only be chosen by adults.
    const u = (await db.query("SELECT birth_date FROM users WHERE id = $1", [id])).rows[0];
    if (req.body.maxRating === "mature" && (!u.birth_date || signup.isMinor(u.birth_date))) {
      return res.status(403).json({ error: "Mature content is only for adults (18+) with a date of birth on their account." });
    }
    await db.query("UPDATE users SET max_rating = $1 WHERE id = $2", [req.body.maxRating, id]);
  }
  if (typeof req.body.hideStrongLanguage === "boolean") await db.query("UPDATE users SET hide_strong_language = $1 WHERE id = $2", [req.body.hideStrongLanguage, id]);
  if (typeof req.body.dailyVerse === "boolean") await db.query("UPDATE users SET daily_verse = $1 WHERE id = $2", [req.body.dailyVerse, id]);
  if (["everyone", "members", "followers"].includes(req.body.postVisibility)) {
    await db.query("UPDATE creator_profiles SET post_visibility = $1 WHERE user_id = $2", [req.body.postVisibility, id]);
  }
  res.json({ ok: true });
});

// GET /api/account/bio  ·  PUT /api/account/bio { bio }   (shown on your member page)
router.get("/bio", requireLogin, async function (req, res) {
  const { rows } = await db.query("SELECT bio FROM users WHERE id = $1", [req.session.user.id]);
  res.json({ bio: rows[0] ? rows[0].bio : "" });
});
router.put("/bio", requireLogin, async function (req, res) {
  const bio = typeof req.body.bio === "string" ? req.body.bio.replace(/\r\n/g, "\n").trim() : "";
  if (bio.length > 300) return res.status(400).json({ error: "Keep your bio to 300 characters.", problems: [{ field: "bio", message: "Up to 300 characters." }] });
  await db.query("UPDATE users SET bio = $1 WHERE id = $2", [bio, req.session.user.id]);
  res.json({ bio: bio });
});

// PUT /api/account/details { birthDate, country, marketing, chatPrivacy }
// Accounts made before birth dates were asked for can add theirs once. After that only the admin can change it.
router.put("/details", requireLogin, async function (req, res) {
  const { rows } = await db.query("SELECT birth_date FROM users WHERE id = $1", [req.session.user.id]);
  const problems = [];
  const sets = [];
  const values = [];
  if (req.body.birthDate !== undefined && !rows[0].birth_date) {
    const birth = signup.checkBirthDate(req.body.birthDate);
    if (birth.problem) problems.push({ field: "birthDate", message: birth.tooYoung
      ? "Chapterhive is for people aged " + signup.MIN_AGE + " and over. Please ask a parent or guardian to contact us." : birth.problem });
    else { values.push(birth.date); sets.push("birth_date = $" + values.length); }
  }
  if (req.body.country !== undefined) {
    const country = signup.checkCountry(req.body.country);
    if (!country) problems.push({ field: "country", message: "Choose a country." });
    else { values.push(country); sets.push("country = $" + values.length); }
  }
  if (req.body.gender !== undefined) {
    values.push(signup.checkGender(req.body.gender)); sets.push("gender = $" + values.length);
  }
  if (typeof req.body.marketing === "boolean") { values.push(req.body.marketing); sets.push("marketing_opt_in = $" + values.length); }
  if (["everyone", "following", "nobody"].includes(req.body.chatPrivacy)) { values.push(req.body.chatPrivacy); sets.push("chat_privacy = $" + values.length); }
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  if (sets.length) {
    values.push(req.session.user.id);
    await db.query("UPDATE users SET " + sets.join(", ") + " WHERE id = $" + values.length, values);
  }
  res.json({ ok: true });
});

// GET /api/account/favourites  -> the logged-in member's saved works
router.get("/favourites", requireLogin, async function (req, res) {
  const { rows } = await db.query(
    `SELECT p.id, p.slug, p.category, p.title, p.summary, p.image_url, f.created_at AS saved_at
       FROM favourites f
       JOIN posts p ON p.id = f.post_id
      WHERE f.user_id = $1 AND (p.published AND p.review_status = 'approved' AND (p.publish_at IS NULL OR p.publish_at <= NOW()))
      ORDER BY f.created_at DESC`,
    [req.session.user.id]
  );
  res.json({
    favourites: rows.map(function (row) {
      return {
        id: row.id,
        slug: row.slug,
        category: row.category,
        title: row.title,
        summary: row.summary,
        imageUrl: thumbnailUrl(row.image_url),
        savedAt: row.saved_at
      };
    })
  });
});

// GET /api/account/stats  -> numbers for the profile page
router.get("/stats", requireLogin, async function (req, res) {
  const id = req.session.user.id;
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM comments WHERE user_id = $1)::int   AS comments,
       (SELECT COUNT(*) FROM likes WHERE user_id = $1)::int      AS likes,
       (SELECT COUNT(*) FROM favourites WHERE user_id = $1)::int AS favourites,
       (SELECT created_at FROM users WHERE id = $1)              AS joined,
       (SELECT password_hash IS NOT NULL FROM users WHERE id = $1) AS "hasPassword",
       (SELECT google_sub IS NOT NULL FROM users WHERE id = $1)    AS "googleLinked",
       (SELECT email FROM users WHERE id = $1)                     AS email,
       (SELECT avatar_url FROM users WHERE id = $1)                AS "avatarUrl"`,
    [id]
  );
  rows[0].avatarUrl = avatarUrl(rows[0].avatarUrl) || null;
  rows[0].mailEnabled = mailEnabled();
  res.json(rows[0]);
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." }
});

// POST /api/account/password  { currentPassword, newPassword }
// Works for members and for the admin. Signs out your other devices.
router.post("/password", requireLogin, passwordLimiter, async function (req, res) {
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  const isAdmin = req.session.user.role === "admin";
  const minLength = isAdmin ? 10 : 8;

  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  const hasPassword = Boolean(rows[0] && rows[0].password_hash);

  const problems = [];
  if (hasPassword && !currentPassword) {
    problems.push({ field: "currentPassword", message: "Enter your current password." });
  }
  const newIssue = signup.passwordProblem(newPassword, req.session.user.username);
  if (newIssue) {
    problems.push({ field: "newPassword", message: newIssue });
  } else if (newPassword === currentPassword) {
    problems.push({ field: "newPassword", message: "Choose a password different from your current one." });
  }
  if (problems.length) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }

  // Accounts made with Google have no password yet: they can set one without a current password.
  const ok = hasPassword ? await bcrypt.compare(currentPassword, rows[0].password_hash) : true;
  if (!ok) {
    return res.status(401).json({
      error: "Your current password is not correct.",
      problems: [{ field: "currentPassword", message: "That is not your current password." }]
    });
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, req.session.user.id]);
  // Sign out every other device that was logged in to this account.
  await db.query(
    "DELETE FROM user_sessions WHERE sid <> $1 AND (sess -> 'user' ->> 'id')::int = $2",
    [req.sessionID, req.session.user.id]
  );
  res.json({ ok: true });
});

// POST /api/account/google/unlink -> stop using Google sign-in (only if the account has a password)
router.post("/google/unlink", requireLogin, async function (req, res) {
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  if (!rows[0] || !rows[0].password_hash) {
    return res.status(400).json({ error: "Set a password first, otherwise you could not log in any more." });
  }
  await db.query("UPDATE users SET google_sub = NULL WHERE id = $1", [req.session.user.id]);
  res.json({ ok: true });
});

// DELETE /api/account  { password }  -> members can delete their own account and everything they posted
router.delete("/", requireLogin, async function (req, res) {
  if (req.session.user.role === "admin") {
    return res.status(400).json({ error: "The admin account cannot be deleted from the website." });
  }
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const { rows } = await db.query("SELECT username, password_hash FROM users WHERE id = $1", [req.session.user.id]);
  const user = rows[0];
  // Accounts without a password (Google sign-in) confirm by typing their username instead.
  const ok = !user ? false
    : user.password_hash ? await bcrypt.compare(password, user.password_hash)
    : password.trim().toLowerCase() === user.username;
  if (!ok) {
    return res.status(401).json({
      error: user && !user.password_hash ? "Type your username exactly to confirm." : "That password is not correct."
    });
  }
  // Collect every uploaded file first, so nothing is left behind on Cloudinary.
  const files = await db.query(
    `SELECT m.public_id, m.kind FROM post_media m JOIN posts p ON p.id = m.post_id WHERE p.user_id = $1
     UNION ALL SELECT cm.public_id, 'image' FROM character_media cm JOIN characters c ON c.id = cm.character_id WHERE c.user_id = $1
     UNION ALL SELECT cover_public_id, 'image' FROM series WHERE user_id = $1
     UNION ALL SELECT banner_public_id, 'image' FROM creator_profiles WHERE user_id = $1
     UNION ALL SELECT avatar_public_id, 'image' FROM users WHERE id = $1`,
    [req.session.user.id]
  );
  await db.query("DELETE FROM users WHERE id = $1", [req.session.user.id]);
  const { deleteAll } = require("../media");
  await deleteAll(files.rows.filter(function (f) { return f.public_id; }));
  req.session.destroy(function () {
    res.clearCookie("mm.sid");
    res.json({ ok: true });
  });
});

/* ---------- Email address (needed for "forgot password") ---------- */

// PUT /api/account/email  { email, currentPassword }  (empty email removes it)
router.put("/email", requireLogin, passwordLimiter, async function (req, res) {
  const email = cleanText(req.body.email).toLowerCase();
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) {
    return res.status(400).json({
      error: "That email address doesn't look right.",
      problems: [{ field: "email", message: "That email address doesn't look right." }]
    });
  }
  // Changing where reset links go is sensitive, so accounts with a password must confirm it.
  const { rows } = await db.query("SELECT password_hash FROM users WHERE id = $1", [req.session.user.id]);
  if (rows[0] && rows[0].password_hash && !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
    return res.status(401).json({
      error: "Your current password is not correct.",
      problems: [{ field: "emailPassword", message: "Enter your current password to change your email." }]
    });
  }
  await db.query("UPDATE users SET email = $1::varchar, email_verified_at = CASE WHEN lower(coalesce(email, '')) = lower(coalesce($1::varchar, '')) THEN email_verified_at ELSE NULL END WHERE id = $2", [email || null, req.session.user.id]);
  res.json({ email: email || null });
});

/* ---------- Profile picture ---------- */

// POST /api/account/avatar  (multipart "image", up to 8 MB)
router.post("/avatar", requireLogin, function (req, res, next) {
  upload.single("image")(req, res, async function (error) {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Pictures must be 8 MB or smaller." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a picture first." });
    try {
      const saved = await saveImage(req.file);
      const old = await db.query("SELECT avatar_public_id FROM users WHERE id = $1", [req.session.user.id]);
      const { rows } = await db.query(
        "UPDATE users SET avatar_url = $1, avatar_public_id = $2 WHERE id = $3 RETURNING *",
        [saved.url, saved.publicId, req.session.user.id]
      );
      if (old.rows[0] && old.rows[0].avatar_public_id) await deleteImage(old.rows[0].avatar_public_id);
      req.session.user = publicUser(rows[0]);
      res.json({ avatarUrl: req.session.user.avatarUrl });
    } catch (saveError) {
      if (/Cloudinary|valid image/.test(saveError.message || "")) {
        return res.status(400).json({ error: saveError.message });
      }
      next(saveError);
    }
  });
});

// DELETE /api/account/avatar
router.delete("/avatar", requireLogin, async function (req, res) {
  const old = await db.query("SELECT avatar_public_id FROM users WHERE id = $1", [req.session.user.id]);
  const { rows } = await db.query(
    "UPDATE users SET avatar_url = NULL, avatar_public_id = NULL WHERE id = $1 RETURNING *",
    [req.session.user.id]
  );
  if (old.rows[0] && old.rows[0].avatar_public_id) await deleteImage(old.rows[0].avatar_public_id);
  req.session.user = publicUser(rows[0]);
  res.json({ avatarUrl: null });
});

/* ---------- Forgot password ---------- */

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many reset requests. Please wait 15 minutes and try again." }
});

const RESET_MINUTES = 60;

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function siteUrl(req) {
  return (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
}

// POST /api/account/forgot  { identifier }  (username or email)
// Always gives the same answer, so nobody can use it to find out which accounts exist.
router.post("/forgot", forgotLimiter, async function (req, res) {
  if (!mailEnabled()) {
    return res.status(503).json({
      error: "Password reset by email isn't switched on yet. Please contact the site owner through the contact form."
    });
  }
  const identifier = cleanText(req.body.identifier).toLowerCase();
  const answer = {
    ok: true,
    message: "If an account with that username or email has an email address saved, a reset link is on its way. " +
      "It works for " + RESET_MINUTES + " minutes. Check your spam folder too."
  };
  if (!identifier || identifier.length > 254) return res.json(answer);

  const { rows } = await db.query(
    "SELECT id, username, display_name, email FROM users WHERE email IS NOT NULL AND (username = $1 OR LOWER(email) = $1) LIMIT 3",
    [identifier]
  );

  for (const user of rows) {
    // At most 3 links per account per hour, so the form can't be used to flood someone's inbox.
    const recent = await db.query(
      "SELECT COUNT(*)::int AS n FROM password_resets WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'",
      [user.id]
    );
    if (recent.rows[0].n >= 3) continue;

    const token = crypto.randomBytes(32).toString("base64url");
    await db.query(
      "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)",
      [hashToken(token), user.id, String(RESET_MINUTES)]
    );
    const link = siteUrl(req) + "/reset?token=" + encodeURIComponent(token);
    const text =
      "Hi " + user.display_name + ",\n\n" +
      "Someone (hopefully you) asked to reset the password for @" + user.username + " on God's Banditos.\n\n" +
      "Choose a new password here (the link works for " + RESET_MINUTES + " minutes, once):\n" + link + "\n\n" +
      "If you didn't ask for this, ignore this email: your password stays the same.\n";
    const safeName = String(user.display_name).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
    const html =
      "<p>Hi " + safeName + ",</p>" +
      "<p>Someone (hopefully you) asked to reset the password for <b>@" + user.username + "</b> on God's Banditos.</p>" +
      "<p><a href=\"" + link + "\" style=\"background:#ff2e97;color:#0b0a10;padding:10px 18px;text-decoration:none;font-weight:bold\">Choose a new password</a></p>" +
      "<p>The link works for " + RESET_MINUTES + " minutes, once. If you didn't ask for this, ignore this email.</p>";
    try {
      await sendMail(user.email, "Reset your God's Banditos password", text, html);
    } catch (error) {
      console.error("Password reset email failed:", error.message);
    }
  }
  res.json(answer);
});

async function findValidReset(token) {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const { rows } = await db.query(
    `SELECT r.user_id, u.username, u.role FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > NOW()`,
    [hashToken(token)]
  );
  return rows[0] || null;
}

// GET /api/account/reset?token=...  -> is this link still good?
router.get("/reset", forgotLimiter, async function (req, res) {
  const reset = await findValidReset(req.query.token);
  if (!reset) return res.status(400).json({ error: "This reset link has expired or was already used. Ask for a new one." });
  res.json({ ok: true, username: reset.username, minLength: 10 });
});

// POST /api/account/reset  { token, password }
router.post("/reset", forgotLimiter, async function (req, res) {
  const reset = await findValidReset(req.body.token);
  if (!reset) return res.status(400).json({ error: "This reset link has expired or was already used. Ask for a new one." });
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const resetIssue = signup.passwordProblem(password, reset.username);
  if (resetIssue) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", problems: [{ field: "password", message: resetIssue }] });
  }
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 12), reset.user_id]);
  // Every link for this account stops working, and every device is signed out.
  await db.query("UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [reset.user_id]);
  await db.query("DELETE FROM user_sessions WHERE (sess -> 'user' ->> 'id')::int = $1", [reset.user_id]);
  res.json({ ok: true, username: reset.username });
});

module.exports = router;
