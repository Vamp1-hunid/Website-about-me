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
      "",
      "Sitemap: " + siteUrl(req) + "/sitemap.xml",
      ""
    ].join("\n")
  );
});

router.get("/sitemap.xml", async function (req, res) {
  const base = siteUrl(req);
  const { rows } = await db.query(
    "SELECT slug, updated_at FROM posts WHERE published = TRUE ORDER BY created_at DESC LIMIT 5000"
  );
  const newest = rows.length ? rows[0].updated_at : new Date();

  const urls = [
    { loc: base + "/", lastmod: newest, priority: "1.0" },
    { loc: base + "/gallery", lastmod: newest, priority: "0.9" },
    { loc: base + "/gallery?category=story-art", lastmod: newest, priority: "0.7" },
    { loc: base + "/gallery?category=anime", lastmod: newest, priority: "0.7" },
    { loc: base + "/gallery?category=writing", lastmod: newest, priority: "0.7" }
  ].concat(
    rows.map(function (row) {
      return { loc: base + "/work/" + encodeURIComponent(row.slug), lastmod: row.updated_at, priority: "0.8" };
    })
  );

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(function (u) {
        return (
          "  <url><loc>" + xmlEscape(u.loc) + "</loc><lastmod>" +
          new Date(u.lastmod).toISOString().slice(0, 10) + "</lastmod><priority>" + u.priority + "</priority></url>"
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
