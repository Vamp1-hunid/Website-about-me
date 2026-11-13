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
  } else {
    if (rows[0].role !== "admin") {
      await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [rows[0].id]);
      console.log("Existing account promoted to admin: " + username);
    }
    // ADMIN_PASSWORD is the source of truth: change it on Render and the
    // new password works after the next restart/deploy.
    const current = await db.query("SELECT password_hash FROM users WHERE id = $1", [rows[0].id]);
    const same = await bcrypt.compare(password, current.rows[0].password_hash);
    if (!same) {
      const hash = await bcrypt.hash(password, 12);
      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, rows[0].id]);
      await db.query("DELETE FROM user_sessions WHERE (sess -> 'user' ->> 'id')::int = $1", [rows[0].id]);
      console.log("Admin password updated from ADMIN_PASSWORD.");
    }
  }
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
