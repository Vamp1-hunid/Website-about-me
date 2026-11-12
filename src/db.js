// src/db.js
// One shared connection pool to PostgreSQL (Neon in production).

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

// Neon (and most hosted databases) require an encrypted connection.
// A database on your own laptop (localhost) usually does not.
const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL) ||
  /host=\/|host=%2F/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: true },
  max: 5
});

// Small helper so route files can write: const { rows } = await db.query(sql, values)
// The values are sent separately from the SQL text ($1, $2 ...), which prevents SQL injection.
function query(text, values) {
  return pool.query(text, values);
}

module.exports = { pool, query };
