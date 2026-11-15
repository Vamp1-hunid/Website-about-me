// src/pages.js
// Serves an HTML page with its title, description and link-preview tags filled in on the server,
// so Google, WhatsApp, Facebook and X show the real work / story / creator instead of a generic page.

const fs = require("fs");
const path = require("path");
const db = require("./db");
const storage = require("./storage");

const publicDir = path.join(__dirname, "..", "public");
const cache = new Map();
const isProduction = process.env.NODE_ENV === "production";

function readPage(file) {
  if (isProduction && cache.has(file)) return cache.get(file);
  const html = fs.readFileSync(path.join(publicDir, file), "utf8");
  if (isProduction) cache.set(file, html);
  return html;
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function siteUrl(req) {
  return (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
}

function absolute(req, url) {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : siteUrl(req) + url;
}

// meta: { title, description, image, type, jsonLd }
function sendPage(req, res, file, meta) {
  let html = readPage(file);
  res.setHeader("Cache-Control", "no-cache");
  if (meta) {
    const url = siteUrl(req) + req.originalUrl.split("?")[0];
    const title = escapeHtml(meta.title);
    const description = escapeHtml(String(meta.description || "").replace(/\s+/g, " ").slice(0, 200));
    const image = escapeHtml(absolute(req, meta.image) || "");
    html = html
      .replace(/<title>[^<]*<\/title>/, "<title>" + title + "</title>")
      .replace(/(<meta name="description" content=")[^"]*(")/, "$1" + description + "$2")
      .replace(/(<meta property="og:title" content=")[^"]*(")/, "$1" + title + "$2")
      .replace(/(<meta property="og:description" content=")[^"]*(")/, "$1" + description + "$2");
    if (image) {
      html = html
        .replace(/(<meta property="og:image" content=")[^"]*(")/, "$1" + image + "$2")
        .replace(/\s*<meta property="og:image:width"[^>]*>\s*<meta property="og:image:height"[^>]*>/, "");
    }
    if (meta.type) html = html.replace(/(<meta property="og:type" content=")[^"]*(")/, "$1" + escapeHtml(meta.type) + "$2");
    let extra = '  <link rel="canonical" href="' + escapeHtml(url) + '">\n  <meta property="og:url" content="' + escapeHtml(url) + '">\n';
    if (meta.jsonLd) {
      // "<" is escaped so the data can never close the script tag.
      extra += '  <script type="application/ld+json">' + JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c") + "</script>\n";
    }
    html = html.replace("</head>", extra + "</head>");
  }
  res.type("html").send(html);
}

const VISIBLE_POST = "p.published AND (p.publish_at IS NULL OR p.publish_at <= NOW()) AND cp.status = 'approved'";

async function findPost(slug) {
  const { rows } = await db.query(
    `SELECT p.slug, p.title, p.summary, p.logline, p.category, p.image_url, p.created_at, p.updated_at,
            cp.handle, cp.name AS creator_name, u.role AS owner_role, ${VISIBLE_POST} AS visible
       FROM posts p JOIN users u ON u.id = p.user_id JOIN creator_profiles cp ON cp.user_id = p.user_id
      WHERE p.slug = $1`,
    [String(slug).slice(0, 120)]
  );
  return rows[0] || null;
}

function postMeta(req, post, brand) {
  if (!post || !post.visible) return null;
  const by = post.creator_name || "God's Banditos";
  const isNews = post.category === "news";
  return {
    title: post.title + " | " + (brand === "afterframe" ? "Afterframe" : "God's Banditos"),
    description: post.logline || post.summary || (isNews ? "Anime update on Afterframe." : "A work by " + by + "."),
    image: storage.thumbnailUrl(post.image_url),
    type: "article",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": isNews ? "NewsArticle" : post.category === "writing" ? "CreativeWork" : "VisualArtwork",
      headline: post.title,
      name: post.title,
      description: post.logline || post.summary || undefined,
      image: absolute(req, storage.thumbnailUrl(post.image_url)) || undefined,
      datePublished: post.created_at,
      dateModified: post.updated_at,
      author: { "@type": "Person", name: by, url: siteUrl(req) + "/hub/c/" + post.handle }
    }
  };
}

async function findSeries(slug) {
  const { rows } = await db.query(
    `SELECT s.slug, s.title, s.logline, s.description, s.cover_url, cp.handle, cp.name AS creator_name, cp.status, u.role AS owner_role
       FROM series s JOIN users u ON u.id = s.user_id JOIN creator_profiles cp ON cp.user_id = s.user_id WHERE s.slug = $1`,
    [String(slug).slice(0, 120)]
  );
  return rows[0] || null;
}

async function findCharacter(slug) {
  const { rows } = await db.query(
    `SELECT c.slug, c.name, c.role, c.tagline, cp.handle, cp.name AS creator_name, u.role AS owner_role,
            (c.published AND (c.publish_at IS NULL OR c.publish_at <= NOW()) AND cp.status = 'approved') AS visible,
            (SELECT m.url FROM character_media m WHERE m.character_id = c.id ORDER BY (m.role = 'portrait') DESC, m.position LIMIT 1) AS portrait
       FROM characters c JOIN users u ON u.id = c.user_id JOIN creator_profiles cp ON cp.user_id = c.user_id WHERE c.slug = $1`,
    [String(slug).slice(0, 120)]
  );
  return rows[0] || null;
}

async function findCreator(handle) {
  const { rows } = await db.query(
    `SELECT cp.handle, cp.name, cp.tagline, cp.bio, cp.status, cp.banner_url, u.avatar_url
       FROM creator_profiles cp JOIN users u ON u.id = cp.user_id WHERE cp.handle = $1`,
    [String(handle).toLowerCase().slice(0, 30)]
  );
  return rows[0] || null;
}

module.exports = { sendPage, findPost, postMeta, findSeries, findCharacter, findCreator, escapeHtml, siteUrl };
