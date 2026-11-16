// src/migrate.js
// Creates the database tables (db/schema.sql) and makes sure the admin account exists.
// Runs automatically when the server starts; you can also run it by hand: npm run migrate

require("./env");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("./db");

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
  await db.query(sql);
  await ensureAdmin();
  await assignOwnership();
  await require("./flags").ensureDefaults();
  await openCommunityFeatures();
  await openHelpAndTeamWording();
}

// One time only: the suggestion box and the Fund the heist button go live for everyone
// (they started as "only me"). After this the admin's choices on Site features are kept.
async function openCommunityFeatures() {
  const done = await db.query("SELECT 1 FROM app_settings WHERE key = 'community_features_v1'");
  if (done.rows.length) return;
  await db.query("UPDATE feature_flags SET audience = 'everyone', updated_at = NOW() WHERE key IN ('suggestion_box', 'hub_support', 'donations')");
  await db.query("INSERT INTO app_settings (key, value) VALUES ('community_features_v1', '1') ON CONFLICT (key) DO NOTHING");
}

// v19: the help assistant is for everyone, and the Fund the heist message credits the whole team.
async function openHelpAndTeamWording() {
  const done = await db.query("SELECT 1 FROM app_settings WHERE key = 'help_team_v19'");
  if (done.rows.length) return;
  await db.query("UPDATE feature_flags SET audience = 'everyone', updated_at = NOW() WHERE key = 'help_assistant'");
  const s = await db.query("SELECT value FROM app_settings WHERE key = 'support'");
  if (s.rows.length) {
    let v = s.rows[0].value;
    try { v = typeof v === "string" ? JSON.parse(v) : v; } catch (e) { v = null; }
    if (v && typeof v.message === "string" && /one person/i.test(v.message)) {
      v.message = "Every story here is made by our crew of writers, artists and helpers. If you enjoy the work, you can chip in to keep the presses running.";
      await db.query("UPDATE app_settings SET value = $1 WHERE key = 'support'", [typeof s.rows[0].value === "string" ? JSON.stringify(v) : v]);
    }
  }
  await db.query("INSERT INTO app_settings (key, value) VALUES ('help_team_v19', '1') ON CONFLICT (key) DO NOTHING");
}

// Version 4 (Chapterhive): every work, story and character has an owner. Anything made
// before that belongs to the admin, whose creator profile is "God's Banditos".
async function assignOwnership() {
  const { rows } = await db.query("SELECT id, display_name FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");
  if (!rows.length) return;
  const admin = rows[0];
  for (const table of ["posts", "series", "characters"]) {
    await db.query(`UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`, [admin.id]);
  }
  await db.query(
    `INSERT INTO creator_profiles (user_id, handle, name, tagline, status, featured, can_write_news, kinds, approved_at, agreement_accepted_at)
     VALUES ($1, 'gods-banditos', 'God''s Banditos', 'Dark fantasy manga, anime works and stories', 'approved', TRUE, TRUE,
             '{manga,animation,stories}', NOW(), NOW())
     ON CONFLICT (user_id) DO NOTHING`,
    [admin.id]
  );
}

// The admin account is created from two environment variables, so the
// password never appears in the code or on GitHub.
async function ensureAdmin() {
  const username = (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!username || !password) {
    console.warn("ADMIN_USERNAME / ADMIN_PASSWORD not set: no admin account was created.");
    return;
  }
  if (password.length < 10) {
    console.warn("ADMIN_PASSWORD must be at least 10 characters: admin account not created.");
    return;
  }

  // If the owner has renamed their account (a nickname), keep using that account.
  const owner = (await db.query("SELECT id, username FROM users WHERE is_owner AND role = 'admin' LIMIT 1")).rows[0];
  if (owner) {
    await applyAdminPasswordReset(owner.username, password);
    return;
  }

  const { rows } = await db.query("SELECT id, role FROM users WHERE username = $1", [username]);

  if (rows.length === 0) {
    const hash = await bcrypt.hash(password, 12);
    const created = await db.query(
      "INSERT INTO users (username, display_name, password_hash, role, terms_accepted_at) VALUES ($1, $2, $3, 'admin', NOW()) RETURNING id",
      [username, process.env.ADMIN_DISPLAY_NAME || "Mulenga Mwamba", hash]
    );
    await require("./users").welcome(created.rows[0].id, "admin");
    console.log("Admin account created: " + username);
  } else if (rows[0].role !== "admin") {
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [rows[0].id]);
    console.log("Existing account promoted to admin: " + username);
  }

  await db.query("UPDATE users SET is_owner = TRUE WHERE username = $1", [username]);
  await applyAdminPasswordReset(username, password);
}

// Two ways to change the admin password:
//  1. On the website (Profile -> Change password). This is the normal way.
//  2. By changing ADMIN_PASSWORD on Render, as a reset if you forget it.
// The server remembers (as a bcrypt hash) which ADMIN_PASSWORD it last applied.
// Only a CHANGED value resets the password, so a normal restart (Render's free
// plan restarts the app often) never undoes a password set on the website.
async function applyAdminPasswordReset(username, password) {
  const stored = await db.query("SELECT value FROM app_settings WHERE key = 'admin_env_password'");
  const known = stored.rows[0] ? await bcrypt.compare(password, stored.rows[0].value) : false;
  if (known) return;

  const envHash = await bcrypt.hash(password, 12);
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('admin_env_password', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [envHash]
  );

  // The very first time, just remember the value (the account already uses it).
  if (!stored.rows[0]) return;

  const user = await db.query("SELECT id FROM users WHERE username = $1", [username]);
  await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(password, 12), user.rows[0].id]);
  await db.query("DELETE FROM user_sessions WHERE (sess -> 'user' ->> 'id')::int = $1", [user.rows[0].id]);
  console.log("Admin password reset from the new ADMIN_PASSWORD value.");
}

module.exports = { migrate };

// Allow "node src/migrate.js" / "npm run migrate" on its own.
if (require.main === module) {
  migrate()
    .then(function () {
      console.log("Database is ready.");
      return db.pool.end();
    })
    .catch(function (error) {
      console.error(error);
      process.exit(1);
    });
}
