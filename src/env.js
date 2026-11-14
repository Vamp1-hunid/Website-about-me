// src/env.js
// Loads .env (on a laptop) and tidies up settings pasted into Render.
// Pasting often brings extra bits along, such as a leading space, quotes,
// "DATABASE_URL=" in front, or a whole "psql '...'" command. This keeps
// only the part the app needs, so a sloppy paste can't crash the server.

require("dotenv").config();

function clean(name, pattern) {
  const raw = process.env[name];
  if (raw === undefined) return;

  let value = String(raw).trim();
  const match = value.match(pattern);
  if (match) {
    value = match[0];
  } else if (value) {
    console.warn(name + " does not look right, so it is being ignored. Check the value in Render -> Environment.");
    value = "";
  }

  if (value !== raw) {
    process.env[name] = value;
  }
}

// postgres://... or postgresql://... up to the first space or quote
clean("DATABASE_URL", /postgres(?:ql)?:\/\/[^\s'"`]+/);
// cloudinary://key:secret@cloud_name, with no "<placeholders>" left in it
clean("CLOUDINARY_URL", /cloudinary:\/\/[^\s'"`<>]+:[^\s'"`<>]+@[^\s'"`<>]+/);

["SESSION_SECRET", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_DISPLAY_NAME", "NODE_ENV"].forEach(function (name) {
  if (typeof process.env[name] === "string") {
    process.env[name] = process.env[name].trim();
  }
});
