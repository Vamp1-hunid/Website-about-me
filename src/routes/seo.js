// src/routes/seo.js
// Helps Google find and list the site:
//  - /robots.txt   tells search engines what to crawl (and what to skip: admin, profile, API)
//  - /sitemap.xml  lists every public page and every published work, with dates
//  - /google<code>.html  answers Google Search Console's "HTML file" ownership check,
//    using the code you paste into GOOGLE_VERIFICATION on Render (no code changes needed).

const express = require("express");
const db = require("../db");

const router = express.Router();

function siteUrl(req) {
  return (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
}

function xmlEscape(text) {
  return String(text).replace(/[<>&'"]/g, function (c) {
    return { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c];
  });
}

router.get("/robots.txt", function (req, res) {
  res.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /profile",
      "Disallow: /api/",
      "Disallow: /auth/",
      "Disallow: /reset",
      "Disallow: /hub/studio",
      "Disallow: /hub/feed",
      "Disallow: /forgot",
      "",
      "Sitemap: " + siteUrl(req) + "/sitemap.xml",
      ""
    ].join("\n")
  );
});

router.get("/sitemap.xml", async function (req, res) {
  const base = siteUrl(req);
  const live = "p.published AND p.review_status = 'approved' AND (p.publish_at IS NULL OR p.publish_at <= NOW()) AND cp.status = 'approved'";
  const posts = await db.query(
    `SELECT p.slug, p.updated_at, p.category, u.role FROM posts p
       JOIN users u ON u.id = p.user_id JOIN creator_profiles cp ON cp.user_id = p.user_id
      WHERE ${live} ORDER BY p.created_at DESC LIMIT 20000`
  );
  const series = await db.query(
    `SELECT s.slug, s.created_at AS updated_at, u.role FROM series s
       JOIN users u ON u.id = s.user_id JOIN creator_profiles cp ON cp.user_id = s.user_id
      WHERE cp.status = 'approved' AND EXISTS (SELECT 1 FROM posts p WHERE p.series_id = s.id AND ${live})`
  );
  const characters = await db.query(
    `SELECT c.slug, c.updated_at, u.role FROM characters c
       JOIN users u ON u.id = c.user_id JOIN creator_profiles cp ON cp.user_id = c.user_id
      WHERE c.published AND (c.publish_at IS NULL OR c.publish_at <= NOW()) AND cp.status = 'approved'`
  );
  const creators = await db.query(
    "SELECT handle, COALESCE(approved_at, created_at) AS updated_at FROM creator_profiles WHERE status = 'approved'"
  );
  const collabs = await db.query(
    `SELECT c.id, c.updated_at FROM collab_posts c JOIN creator_profiles cp ON cp.user_id = c.user_id
      WHERE c.status = 'open' AND cp.status = 'approved'`
  );
  const now = new Date();
  const newest = posts.rows.length ? posts.rows[0].updated_at : now;

  const fixed = [
    ["/", "1.0"], ["/gallery", "0.9"], ["/stories", "0.8"], ["/creator", "0.9"], ["/products", "0.6"], ["/contact", "0.6"], ["/help", "0.5"], ["/hub/sponsor", "0.5"],
    ["/gallery?category=story-art", "0.6"], ["/gallery?category=anime", "0.6"], ["/gallery?category=writing", "0.6"],
    ["/gallery?category=updates", "0.5"], ["/hub", "1.0"], ["/hub/creators", "0.8"], ["/hub/news", "0.8"], ["/hub/collabs", "0.7"],
    ["/legal/terms", "0.2"], ["/legal/privacy", "0.2"], ["/legal/creator-agreement", "0.2"], ["/legal/content-rules", "0.2"]
  ].map(function (u) { return { loc: base + u[0], lastmod: newest, priority: u[1] }; });

  const urls = fixed
    .concat(posts.rows.map(function (r) {
      const path = r.category === "news" ? "/hub/news/" : r.role === "admin" ? "/work/" : "/hub/w/";
      return { loc: base + path + encodeURIComponent(r.slug), lastmod: r.updated_at, priority: "0.8" };
    }))
    .concat(series.rows.map(function (r) {
      return { loc: base + (r.role === "admin" ? "/stories/" : "/hub/s/") + encodeURIComponent(r.slug), lastmod: r.updated_at, priority: "0.7" };
    }))
    .concat(characters.rows.map(function (r) {
      return { loc: base + (r.role === "admin" ? "/characters/" : "/hub/ch/") + encodeURIComponent(r.slug), lastmod: r.updated_at, priority: "0.5" };
    }))
    .concat(collabs.rows.map(function (r) {
      return { loc: base + "/hub/collabs/" + r.id, lastmod: r.updated_at, priority: "0.5" };
    }))
    .concat(creators.rows.map(function (r) {
      return { loc: base + "/hub/c/" + encodeURIComponent(r.handle), lastmod: r.updated_at, priority: "0.7" };
    }));

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(function (u) {
        return (
          "  <url><loc>" + xmlEscape(u.loc) + "</loc><lastmod>" +
          new Date(u.lastmod || now).toISOString().slice(0, 10) + "</lastmod><priority>" + u.priority + "</priority></url>"
        );
      })
      .join("\n") +
    "\n</urlset>\n";

  res.type("application/xml").send(body);
});

// Google Search Console ownership file. Set GOOGLE_VERIFICATION on Render to the file name
// Google gives you, e.g. "google1a2b3c4d5e6f7a8b" or "google1a2b3c4d5e6f7a8b.html".
router.get(/^\/(google[a-zA-Z0-9]+)\.html$/, function (req, res, next) {
  const wanted = (process.env.GOOGLE_VERIFICATION || "").trim().replace(/\.html$/, "");
  const asked = req.params[0];
  if (!wanted || asked !== wanted) return next();
  res.type("text/html").send("google-site-verification: " + wanted + ".html");
});

module.exports = router;
