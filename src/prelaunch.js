// src/prelaunch.js
// Before launch (reservations on, new accounts off), people who reserved a name can sign in to check
// their place on the list and read team updates, but only the team (admin and beta testers) can
// post, comment, chat and so on. Following creators and liking their posts are open to everyone. Account and notification settings still work for everyone.

const db = require("./db");
const flags = require("./flags");

const ALWAYS_ALLOWED = [/^\/account\//, /^\/notifications/, /^\/reserve/, /^\/beta/, /^\/contact/, /^\/help/, /^\/app\//,
  // Following creators works before launch too, so people can line up their favourite artists for day one.
  // (Following other members is checked in routes/users.js: creators only until launch, unless you're a beta tester.)
  /^\/hub\/creators\/[^/]+\/follow$/, /^\/users\/[^/]+\/follow$/,
  // v30: liking creators' posts works before launch too (saving, comments, chat and posting still wait).
  /^\/posts\/\d+\/like$/];

async function isPrelaunch(req) {
  return (await flags.isOn("reservations", req)) && !(await flags.isOn("signups", req));
}

async function waitingMember(req) {
  const u = req.session && req.session.user;
  if (!u || u.role === "admin") return false;
  if (!(await isPrelaunch(req))) return false;
  const { rows } = await db.query("SELECT is_beta FROM users WHERE id = $1", [u.id]);
  return !(rows[0] && rows[0].is_beta);
}

// Blocks changes (anything but GET) for signed-in people who are waiting for launch.
async function guardWrites(req, res, next) {
  try {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    if (ALWAYS_ALLOWED.some(function (re) { return re.test(req.path); })) return next();
    if (await waitingMember(req)) {
      return res.status(403).json({ error: "Chapterhive opens soon! Until launch you can check the reservation list and team updates; posting, comments, follows and chat open at launch.", prelaunch: true });
    }
    next();
  } catch (e) { next(e); }
}

module.exports = { guardWrites, waitingMember, isPrelaunch };
