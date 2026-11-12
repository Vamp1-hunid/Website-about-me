// server.js
// Starts the website: serves the pages in public/ and the JSON API under /api.

require("dotenv").config();

const path = require("path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);

const db = require("./src/db");
const { migrate } = require("./src/migrate");
const { sameOriginOnly } = require("./src/auth");

const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3000;

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  if (isProduction) {
    throw new Error("SESSION_SECRET must be set to a long random value (32+ characters).");
  }
  console.warn("SESSION_SECRET is missing or short. Fine for testing, but set a long one on Render.");
}

const app = express();

// Render sits in front of the app as a proxy; this lets secure cookies work over HTTPS.
app.set("trust proxy", 1);
app.disable("x-powered-by");

// Security headers. The Content Security Policy lists every place the pages may load things from.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null
      }
    }
  })
);

app.use(express.json({ limit: "100kb" }));

app.use(
  session({
    store: new PgSession({ pool: db.pool, tableName: "user_sessions" }),
    name: "mm.sid",
    secret: process.env.SESSION_SECRET || "dev-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,                // page scripts cannot read the cookie
      sameSite: "lax",               // not sent on cross-site form posts
      secure: isProduction,          // HTTPS only on Render
      maxAge: 14 * 24 * 60 * 60 * 1000 // stay logged in for 14 days of inactivity
    }
  })
);

/* ---------- API ---------- */

const api = express.Router();
api.use(sameOriginOnly);
api.use("/account", require("./src/routes/account"));
api.use("/posts", require("./src/routes/posts"));
api.use("/comments", require("./src/routes/comments"));
api.get("/health", function (req, res) {
  res.json({ ok: true });
});
api.use(function (req, res) {
  res.status(404).json({ error: "Unknown API address." });
});
app.use("/api", api);

/* ---------- Pages ---------- */

const publicDir = path.join(__dirname, "public");

// /work/a-year-to-burn shows the single-work page; its script reads the slug from the address.
app.get("/work/:slug", function (req, res) {
  res.sendFile(path.join(publicDir, "work.html"));
});

// Serves index.html, css/, js/, images/ ... and lets /gallery mean gallery.html.
app.use(
  express.static(publicDir, {
    extensions: ["html"],
    maxAge: isProduction ? "1h" : 0
  })
);

app.use(function (req, res) {
  res.status(404).sendFile(path.join(publicDir, "404.html"));
});

/* ---------- Errors ---------- */

// Any unexpected error ends up here. The visitor gets a short message;
// the details go to the Render logs only.
app.use(function (error, req, res, next) {
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }
  if (req.originalUrl.startsWith("/api")) {
    return res.status(500).json({ error: "Something went wrong on the server. Please try again." });
  }
  res.status(500).send("Something went wrong on the server. Please try again.");
});

/* ---------- Start ---------- */

migrate()
  .then(function () {
    app.listen(PORT, function () {
      console.log("Website running on http://localhost:" + PORT);
    });
  })
  .catch(function (error) {
    console.error("Could not prepare the database:", error);
    process.exit(1);
  });
