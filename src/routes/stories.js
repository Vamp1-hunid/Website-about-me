// src/routes/stories.js
// Public story pages and character profiles:
//   GET /api/stories              every story (series) that has something public in it
//   GET /api/stories/:slug        one story: cover, logline, chapters, characters, concept art
//   GET /api/stories/characters/:slug   one character's profile and pictures

const express = require("express");
const db = require("../db");
const storage = require("../storage");
const { VISIBLE, toPost, SELECT_POST } = require("./posts");

const OWNER_JOIN = "LEFT JOIN creator_profiles cps ON cps.user_id = s.user_id LEFT JOIN users us ON us.id = s.user_id";

const router = express.Router();

// Characters follow the same rule as works: published, and the publish time (if any) has passed.
const CHAR_VISIBLE = "(c.published AND (c.publish_at IS NULL OR c.publish_at <= NOW()) AND EXISTS " +
  "(SELECT 1 FROM creator_profiles cpc WHERE cpc.user_id = c.user_id AND cpc.status = 'approved'))";

function toCharacterCard(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    role: row.role,
    tagline: row.tagline,
    portraitUrl: storage.thumbnailUrl(row.portrait_url) || null
  };
}

const CHARACTER_CARD_SQL = `
  SELECT c.*,
    (SELECT m.url FROM character_media m WHERE m.character_id = c.id
      ORDER BY (m.role = 'portrait') DESC, m.position LIMIT 1) AS portrait_url
  FROM characters c`;

// GET /api/stories             every creator's stories;  ?creator=<handle>  one creator's
router.get("/", async function (req, res) {
  const values = [];
  let scope = "";
  if (typeof req.query.creator === "string") {
    values.push(req.query.creator.toLowerCase().slice(0, 30));
    scope = "WHERE cps.handle = $1";
  }
  const { rows } = await db.query(
    `SELECT s.*, cps.handle AS creator_handle, cps.name AS creator_name, us.role AS owner_role,
       (SELECT COUNT(*) FROM posts p WHERE p.series_id = s.id AND p.section = 'main' AND ${VISIBLE})::int AS chapters,
       (SELECT COUNT(*) FROM characters c WHERE c.series_id = s.id AND ${CHAR_VISIBLE})::int AS characters,
       (SELECT p.image_url FROM posts p WHERE p.series_id = s.id AND ${VISIBLE} AND p.image_url IS NOT NULL
         ORDER BY p.series_order NULLS LAST, p.created_at LIMIT 1) AS fallback_cover
       FROM series s ${OWNER_JOIN} ${scope} ORDER BY s.title`,
    values
  );
  res.json({
    stories: rows
      .filter(function (row) { return row.chapters > 0 || row.characters > 0; })
      .map(function (row) {
        return {
          slug: row.slug,
          title: row.title,
          logline: row.logline,
          description: row.description,
          coverUrl: storage.thumbnailUrl(row.cover_url || row.fallback_cover) || null,
          chapters: row.chapters,
          characters: row.characters,
          creator: row.creator_handle ? { handle: row.creator_handle, name: row.creator_name, isBanditos: row.owner_role === "admin" } : null
        };
      })
  });
});

// GET /api/stories/characters/:slug
router.get("/characters/:slug", async function (req, res) {
  const isAdmin = req.session.user && req.session.user.role === "admin";
  const { rows } = await db.query(
    `SELECT c.*, s.slug AS series_slug, s.title AS series_title, ${CHAR_VISIBLE} AS visible,
            cpo.handle AS creator_handle, cpo.name AS creator_name, uo.role AS owner_role
       FROM characters c LEFT JOIN series s ON s.id = c.series_id
       LEFT JOIN creator_profiles cpo ON cpo.user_id = c.user_id LEFT JOIN users uo ON uo.id = c.user_id
      WHERE c.slug = $1`,
    [String(req.params.slug).slice(0, 120)]
  );
  const row = rows[0];
  const viewerId = req.session.user ? req.session.user.id : null;
  if (!row || (!row.visible && !isAdmin && row.user_id !== viewerId)) {
    return res.status(404).json({ error: "That character could not be found." });
  }
  const media = await db.query("SELECT * FROM character_media WHERE character_id = $1 ORDER BY (role = 'portrait') DESC, position", [row.id]);
  let others = [];
  if (row.series_id) {
    const list = await db.query(
      CHARACTER_CARD_SQL + ` WHERE c.series_id = $1 AND c.id <> $2 AND ${CHAR_VISIBLE} ORDER BY c.sort_order NULLS LAST, c.name`,
      [row.series_id, row.id]
    );
    others = list.rows.map(toCharacterCard);
  }
  res.json({
    character: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      role: row.role,
      tagline: row.tagline,
      profile: row.profile,
      visible: row.visible,
      published: row.published,
      publishAt: row.publish_at,
      series: row.series_id ? { slug: row.series_slug, title: row.series_title } : null,
      creator: row.creator_handle ? { handle: row.creator_handle, name: row.creator_name, isBanditos: row.owner_role === "admin" } : null,
      media: media.rows.map(function (m) {
        return {
          id: m.id,
          role: m.role,
          kind: "image",
          url: storage.displayUrl(m.url, "image"),
          originalUrl: m.url,
          thumbUrl: storage.thumbnailUrl(m.url),
          caption: m.caption
        };
      })
    },
    others: others
  });
});

// GET /api/stories/:slug
router.get("/:slug", async function (req, res) {
  const { rows } = await db.query(
    `SELECT s.*, cps.handle AS creator_handle, cps.name AS creator_name, us.role AS owner_role, cps.status AS creator_status
       FROM series s ${OWNER_JOIN} WHERE s.slug = $1`,
    [String(req.params.slug).slice(0, 120)]
  );
  const series = rows[0];
  if (!series || (series.creator_status !== "approved" && !(req.session.user && req.session.user.role === "admin"))) {
    return res.status(404).json({ error: "That story could not be found." });
  }

  const works = await db.query(
    `${SELECT_POST} WHERE p.series_id = $1 AND ${VISIBLE}
      ORDER BY p.series_order ASC NULLS LAST, p.created_at ASC`,
    [series.id]
  );
  const characters = await db.query(
    CHARACTER_CARD_SQL + ` WHERE c.series_id = $1 AND ${CHAR_VISIBLE} ORDER BY c.sort_order NULLS LAST, c.name`,
    [series.id]
  );
  // Concept art: works filed under "Concept art", plus the concept sheets of this story's characters.
  const characterArt = await db.query(
    `SELECT m.url, m.caption, c.name, c.slug FROM character_media m JOIN characters c ON c.id = m.character_id
      WHERE c.series_id = $1 AND m.role = 'concept' AND ${CHAR_VISIBLE}
      ORDER BY c.sort_order NULLS LAST, c.name, m.position LIMIT 200`,
    [series.id]
  );

  const posts = works.rows.map(function (row) { return toPost(row, false); });
  const firstCover = posts.find(function (p) { return p.imageUrl; });
  res.json({
    story: {
      slug: series.slug,
      title: series.title,
      logline: series.logline,
      description: series.description,
      coverUrl: storage.displayUrl(series.cover_url, "image") || (firstCover ? firstCover.imageUrl : null),
      creator: series.creator_handle ? { handle: series.creator_handle, name: series.creator_name, isBanditos: series.owner_role === "admin" } : null
    },
    chapters: posts.filter(function (p) { return p.section === "main"; }),
    conceptArt: posts.filter(function (p) { return p.section === "concept-art"; }),
    characterArt: characterArt.rows.map(function (row) {
      return { url: storage.thumbnailUrl(row.url), fullUrl: row.url, caption: row.caption, character: { name: row.name, slug: row.slug } };
    }),
    characters: characters.rows.map(toCharacterCard)
  });
});

module.exports = router;
module.exports.CHAR_VISIBLE = CHAR_VISIBLE;
