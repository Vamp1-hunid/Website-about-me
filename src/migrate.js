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

  const { rows } = await db.query("SELECT id, role FROM users WHERE username = $1", [username]);

  if (rows.length === 0) {
    const hash = await bcrypt.hash(password, 12);
    await db.query(
      "INSERT INTO users (username, display_name, password_hash, role) VALUES ($1, $2, $3, 'admin')",
      [username, process.env.ADMIN_DISPLAY_NAME || "Mulenga Mwamba", hash]
    );
    console.log("Admin account created: " + username);
  } else if (rows[0].role !== "admin") {
    await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [rows[0].id]);
    console.log("Existing account promoted to admin: " + username);
  }

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
