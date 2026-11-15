// server.js
// Starts the website: serves the pages in public/ and the JSON API under /api.

require("./src/env");

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
        mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com"],
        // api.cloudinary.com: the admin page uploads big files straight to Cloudinary.
        connectSrc: ["'self'", "https://api.cloudinary.com"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: isProduction ? [] : null
      }
    }
  })
);

// Saving a work can carry a long chapter of text; everything else is small.
app.use(["/api/posts", "/api/admin"], express.json({ limit: "1mb" }));
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
// Online status, streaks and ban checks for logged-in people.
api.use(require("./src/auth").trackActivity);
api.use("/account", require("./src/routes/account"));
api.use("/posts", require("./src/routes/posts"));
api.use("/comments", require("./src/routes/comments"));
api.use("/users", require("./src/routes/users"));
api.use("/contact", require("./src/routes/contact"));
api.use("/stories", require("./src/routes/stories"));
api.use("/hub", require("./src/routes/hub"));
api.use("/collabs", require("./src/routes/collabs"));
api.use("/notifications", require("./src/routes/notifications"));
api.use("/chat", require("./src/routes/chat"));
api.use("/premium", require("./src/routes/premium"));
api.use("/help", require("./src/routes/help"));
api.use(require("./src/routes/business"));
api.use(require("./src/routes/search"));
api.use("/admin", require("./src/routes/admin"));
api.get("/health", function (req, res) {
  res.json({ ok: true });
});
api.use(function (req, res) {
  res.status(404).json({ error: "Unknown API address." });
});
app.use("/api", api);

/* ---------- Google sign-in ---------- */

app.use("/auth/google", require("./src/routes/google").router);

/* ---------- Search engines (robots.txt, sitemap.xml, Google verification) ---------- */

app.use(require("./src/routes/seo"));

/* ---------- Pages ---------- */

const publicDir = path.join(__dirname, "public");

const pages = require("./src/pages");
const storageForPages = require("./src/storage");

// ----- God's Banditos pages (works, stories and characters by the admin) -----
// Another creator's work opened at a God's Banditos address is sent to its Chapterhive address.

app.get("/work/:slug", async function (req, res) {
  const post = await pages.findPost(req.params.slug);
  if (post && post.owner_role !== "admin") return res.redirect(301, "/hub/w/" + encodeURIComponent(post.slug));
  pages.sendPage(req, res, "work.html", pages.postMeta(req, post, "banditos"));
});

app.get("/stories/:slug", async function (req, res) {
  const s = await pages.findSeries(req.params.slug);
  if (s && s.owner_role !== "admin") return res.redirect(301, "/hub/s/" + encodeURIComponent(s.slug));
  pages.sendPage(req, res, "story.html", s && s.status === "approved" ? {
    title: s.title + " | God's Banditos",
    description: s.logline || s.description || "A story by God's Banditos.",
    image: storageForPages.thumbnailUrl(s.cover_url),
    jsonLd: { "@context": "https://schema.org", "@type": "CreativeWorkSeries", name: s.title, description: s.logline || s.description || undefined,
      author: { "@type": "Organization", name: "God's Banditos" } }
  } : null);
});

app.get("/characters/:slug", async function (req, res) {
  const c = await pages.findCharacter(req.params.slug);
  if (c && c.owner_role !== "admin") return res.redirect(301, "/hub/ch/" + encodeURIComponent(c.slug));
  pages.sendPage(req, res, "character.html", c && c.visible ? {
    title: c.name + " | God's Banditos",
    description: c.tagline || (c.role ? c.role + " in a God's Banditos story." : "A God's Banditos character."),
    image: storageForPages.thumbnailUrl(c.portrait)
  } : null);
});

// /u/mwamba shows a member's public page.
app.get("/u/:username", function (req, res) {
  pages.sendPage(req, res, "user.html", null);
});

// ----- Chapterhive (/hub): the creator platform -----

app.get(["/hub", "/hub/"], function (req, res) {
  pages.sendPage(req, res, "hub/index.html", null);
});

app.get("/hub/w/:slug", async function (req, res) {
  const post = await pages.findPost(req.params.slug);
  pages.sendPage(req, res, "hub/work.html", pages.postMeta(req, post, "chapterhive"));
});

app.get("/hub/news/:slug", async function (req, res) {
  const post = await pages.findPost(req.params.slug);
  pages.sendPage(req, res, "hub/work.html", pages.postMeta(req, post, "chapterhive"));
});

app.get("/hub/s/:slug", async function (req, res) {
  const s = await pages.findSeries(req.params.slug);
  pages.sendPage(req, res, "hub/story.html", s && s.status === "approved" ? {
    title: s.title + " by " + s.creator_name + " | Chapterhive",
    description: s.logline || s.description || "A story on Chapterhive.",
    image: storageForPages.thumbnailUrl(s.cover_url),
    jsonLd: { "@context": "https://schema.org", "@type": "CreativeWorkSeries", name: s.title, description: s.logline || s.description || undefined,
      author: { "@type": "Person", name: s.creator_name } }
  } : null);
});

app.get("/hub/ch/:slug", async function (req, res) {
  const c = await pages.findCharacter(req.params.slug);
  pages.sendPage(req, res, "hub/character.html", c && c.visible ? {
    title: c.name + " | " + c.creator_name + " | Chapterhive",
    description: c.tagline || (c.role ? c.role + ", by " + c.creator_name + "." : "A character on Chapterhive."),
    image: storageForPages.thumbnailUrl(c.portrait)
  } : null);
});

app.get("/hub/collabs/:id", async function (req, res) {
  const db = require("./src/db");
  const id = /^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : 0;
  const { rows } = await db.query(
    `SELECT c.title, c.description, cp.name FROM collab_posts c JOIN creator_profiles cp ON cp.user_id = c.user_id
      WHERE c.id = $1 AND c.status = 'open' AND cp.status = 'approved'`,
    [id]
  );
  const c = rows[0];
  pages.sendPage(req, res, "hub/collab.html", c ? {
    title: c.title + " | Collabs | Chapterhive",
    description: c.name + " is looking for collaborators: " + c.description.slice(0, 160)
  } : null);
});

app.get("/hub/c/:handle", async function (req, res) {
  const c = await pages.findCreator(req.params.handle);
  pages.sendPage(req, res, "hub/creator.html", c && c.status === "approved" ? {
    title: c.name + " (@" + c.handle + ") | Chapterhive",
    description: c.tagline || String(c.bio || "").slice(0, 180) || c.name + " on Chapterhive.",
    image: storageForPages.thumbnailUrl(c.banner_url) || storageForPages.avatarUrl(c.avatar_url),
    type: "profile",
    jsonLd: { "@context": "https://schema.org", "@type": "ProfilePage",
      mainEntity: { "@type": "Person", name: c.name, alternateName: "@" + c.handle, description: c.tagline || undefined } }
  } : null);
});

// God's Banditos has no public sign-up: joining happens on Chapterhive.
app.get(["/register", "/register.html"], function (req, res) {
  const query = req.originalUrl.indexOf("?") >= 0 ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
  res.redirect(301, "/hub/register" + query);
});

// Serves index.html, css/, js/, images/ ... and lets /gallery mean gallery.html.
app.use(
  express.static(publicDir, {
    extensions: ["html"],
    // Pages, styles and scripts: the browser checks for a newer version on every visit
    // (a quick "not modified" reply when nothing changed), so updates show up straight away.
    // Photos, video and audio rarely change: browsers may keep them for a week.
    setHeaders: function (res, filePath) {
      if (/\.(html|css|js)$/i.test(filePath)) {
        res.setHeader("Cache-Control", "no-cache");
      } else if (isProduction) {
        res.setHeader("Cache-Control", "public, max-age=604800");
      }
    }
  })
);

app.use(function (req, res) {
  res.setHeader("Cache-Control", "no-cache");
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
    require("./src/publishing").start();
  })
  .catch(function (error) {
    console.error("Could not prepare the database:", error);
    process.exit(1);
  });
