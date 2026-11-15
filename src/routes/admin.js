// src/routes/admin.js
// Admin-only tools (every route here needs the admin account):
//  - /status            is everything on Render set up properly? (Cloudinary, email, Google ...)
//  - /comments          the latest comments on every work, for moderation
//  - /series            create, rename and delete series
//  - /media/...         uploading pictures, video and audio for works
//  - /import-document   turn a .docx, .txt or .md file into text for the editor

const express = require("express");
const cloudinary = require("cloudinary").v2;
const db = require("../db");
const { requireAdmin, requireCreator } = require("../auth");
const storage = require("../storage");
const { mailEnabled, mailProvider } = require("../mail");
const { googleEnabled } = require("./google");
const { toComment, COMMENT_SELECT, uniqueSlug, VISIBLE } = require("./posts");
const { resolveMedia, parsePublishAt, statusOf, deleteAll } = require("../media");

const router = express.Router();
// Stories, characters and uploads are open to approved Afterframe creators (each sees only their own);
// everything else here is for the admin only.
router.use(function (req, res, next) {
  if (/^\/(series|characters|media|import-document)(\/|$)/.test(req.path)) return requireCreator(req, res, next);
  return requireAdmin(req, res, next);
});

router.param("id", function (req, res, next, value) {
  if (!/^\d{1,9}$/.test(value)) {
    return res.status(404).json({ error: "Not found." });
  }
  next();
});

/* ---------- Status panel ---------- */

// GET /api/admin/status -> a list of checks, each { name, ok, level, message }
router.get("/status", async function (req, res) {
  const checks = [];
  const add = function (name, ok, message, level) {
    checks.push({ name: name, ok: ok, level: ok ? "ok" : level || "error", message: message });
  };

  add("Database", true, "Connected.");

  if (storage.useCloudinary) {
    try {
      await cloudinary.api.ping();
      add("Cloudinary (uploads)", true, "Connected. Uploads go to your Cloudinary account.");
    } catch (error) {
      add("Cloudinary (uploads)", false,
        "CLOUDINARY_URL is set but Cloudinary refused it (" + String(error.message || error.error && error.error.message || error).slice(0, 120) +
        "). Copy the API environment variable again from the Cloudinary dashboard into Render.");
    }
  } else if (process.env.CLOUDINARY_URL_REJECTED) {
    add("Cloudinary (uploads)", false,
      "CLOUDINARY_URL on Render doesn't look right, so it was ignored. It must look like cloudinary://123456:abcDEF@your-cloud-name, with no < > placeholders left in it.");
  } else if (process.env.NODE_ENV === "production") {
    add("Cloudinary (uploads)", false,
      "CLOUDINARY_URL isn't set. Uploads are saved on Render's disk and DISAPPEAR on the next restart. Add CLOUDINARY_URL under Render -> Environment.");
  } else {
    add("Cloudinary (uploads)", true, "Not set: uploads are saved in public/uploads/ (fine on a laptop).");
  }

  if (mailEnabled()) {
    add("Email (forgot password)", true, "On, using " + (mailProvider() === "brevo" ? "Brevo" : "Resend") + ".");
  } else {
    add("Email (forgot password)", false,
      "Off. Members can't reset a forgotten password by email until you add BREVO_API_KEY (or RESEND_API_KEY) and MAIL_FROM on Render.",
      "warn");
  }

  const contactTo = (process.env.CONTACT_EMAIL || "").trim();
  if (mailEnabled() && contactTo) {
    add("Contact form", true, "Messages are emailed to " + contactTo.replace(/^(.).*(@.*)$/, "$1…$2") + " and saved in the Inbox tab.");
  } else {
    add("Contact form", false,
      "Messages are saved in the Inbox tab but not emailed to you yet. Set up email (above) and add CONTACT_EMAIL (your own address) on Render.",
      "warn");
  }

  add("Google sign-in", googleEnabled(), googleEnabled()
    ? "On."
    : "Off (optional). Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Render to switch it on.", "warn");

  if (process.env.NODE_ENV !== "production" && req.get("host") && !/localhost|127\.0\.0\.1/.test(req.get("host"))) {
    add("NODE_ENV", false, "NODE_ENV isn't \"production\" on the live site. Set NODE_ENV=production on Render so logins use secure cookies.", "warn");
  }

  res.json({ checks: checks });
});

/* ---------- Comment moderation ---------- */

// GET /api/admin/comments?page=1 -> newest comments across all works
router.get("/comments", async function (req, res) {
  const page = Math.min(10000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const size = 25;
  const total = await db.query("SELECT COUNT(*)::int AS n FROM comments");
  const { rows } = await db.query(
    `SELECT x.*, p.slug AS post_slug, p.title AS post_title
       FROM (${COMMENT_SELECT}) x JOIN posts p ON p.id = x.post_id
      ORDER BY x.created_at DESC, x.id DESC
      LIMIT $1 OFFSET $2`,
    [size, (page - 1) * size]
  );
  res.json({
    comments: rows.map(function (row) {
      const comment = toComment(row, req.session.user);
      comment.work = { slug: row.post_slug, title: row.post_title };
      return comment;
    }),
    page: page,
    pages: Math.max(1, Math.ceil(total.rows[0].n / size)),
    total: total.rows[0].n
  });
});

/* ---------- Stories (series) ---------- */

function seriesValues(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const logline = typeof body.logline === "string" ? body.logline.trim() : "";
  const problems = [];
  if (!title || title.length > 120) problems.push({ field: "title", message: "Give the story a name (up to 120 characters)." });
  if (logline.length > 200) problems.push({ field: "logline", message: "Keep the logline to one sentence (200 characters at most)." });
  if (description.length > 600) problems.push({ field: "description", message: "Keep the description to 600 characters." });
  return { title: title, description: description, logline: logline, problems: problems };
}

function toSeries(row) {
  return {
    id: row.id, slug: row.slug, title: row.title, logline: row.logline, description: row.description,
    coverUrl: storage.thumbnailUrl(row.cover_url) || null, works: row.works || 0, characters: row.characters || 0
  };
}

// A single cover picture arrives like any other upload:
//   { keep: true } | { upload: {...} } | { local: {...} } | null (remove it)
function resolveCover(input, oldUrl, oldPublicId) {
  if (input === undefined || (input && input.keep)) return { url: oldUrl || null, publicId: oldPublicId || null, changed: false };
  if (input === null || input === "") return { url: null, publicId: null, changed: true };
  const result = resolveMedia([input], [], { roles: ["cover"], kinds: ["image"], max: 1 });
  if (result.problem) return { problem: result.problem };
  return { url: result.items[0].url, publicId: result.items[0].publicId, changed: true };
}

// GET /api/admin/series -> every story, with how many works and characters it has
router.get("/series", async function (req, res) {
  const { rows } = await db.query(
    `SELECT s.*, (SELECT COUNT(*) FROM posts p WHERE p.series_id = s.id)::int AS works,
            (SELECT COUNT(*) FROM characters c WHERE c.series_id = s.id)::int AS characters
       FROM series s WHERE s.user_id = $1 ORDER BY s.title`,
    [req.session.user.id]
  );
  res.json({ series: rows.map(toSeries) });
});

async function saveSeries(req, res, old) {
  const v = seriesValues(req.body);
  const cover = resolveCover(req.body.cover, old && old.cover_url, old && old.cover_public_id);
  if (cover.problem) v.problems.push({ field: "cover", message: cover.problem });
  if (v.problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: v.problems });

  let row;
  if (old) {
    const slug = old.title === v.title ? old.slug : await uniqueSlug("series", v.title, old.id);
    row = (await db.query(
      `UPDATE series SET slug = $1, title = $2, description = $3, logline = $4, cover_url = $5, cover_public_id = $6
        WHERE id = $7 RETURNING *`,
      [slug, v.title, v.description, v.logline, cover.url, cover.publicId, old.id]
    )).rows[0];
    if (cover.changed && old.cover_public_id) await storage.deleteImage(old.cover_public_id);
  } else {
    const slug = await uniqueSlug("series", v.title);
    row = (await db.query(
      "INSERT INTO series (slug, title, description, logline, cover_url, cover_public_id, user_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
      [slug, v.title, v.description, v.logline, cover.url, cover.publicId, req.session.user.id]
    )).rows[0];
  }
  res.status(old ? 200 : 201).json({ series: toSeries(row) });
}

// POST /api/admin/series { title, logline, description, cover }
router.post("/series", function (req, res) {
  return saveSeries(req, res, null);
});

// PUT /api/admin/series/:id
router.put("/series/:id", async function (req, res) {
  const old = await db.query("SELECT * FROM series WHERE id = $1 AND user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!old.rows.length) return res.status(404).json({ error: "That story could not be found." });
  return saveSeries(req, res, old.rows[0]);
});

// DELETE /api/admin/series/:id  (its works and characters stay; they just stop belonging to it)
router.delete("/series/:id", async function (req, res) {
  const { rows } = await db.query("DELETE FROM series WHERE id = $1 AND user_id = $2 RETURNING cover_public_id", [Number(req.params.id), req.session.user.id]);
  if (!rows.length) return res.status(404).json({ error: "That story could not be found." });
  await storage.deleteImage(rows[0].cover_public_id);
  res.json({ ok: true });
});

/* ---------- Characters ---------- */

function toCharacter(row, media) {
  const character = {
    id: row.id, slug: row.slug, name: row.name, role: row.role, tagline: row.tagline,
    seriesId: row.series_id, seriesTitle: row.series_title || null, sortOrder: row.sort_order,
    published: row.published, publishAt: row.publish_at, status: statusOf(row),
    portraitUrl: storage.thumbnailUrl(row.portrait_url) || null,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
  if (media) {
    character.profile = row.profile;
    character.media = media.map(function (m) {
      return { id: m.id, kind: "image", role: m.role, url: m.url, thumbUrl: storage.thumbnailUrl(m.url), caption: m.caption };
    });
  }
  return character;
}

const CHARACTER_SQL = `
  SELECT c.*, s.title AS series_title,
    (SELECT m.url FROM character_media m WHERE m.character_id = c.id ORDER BY (m.role = 'portrait') DESC, m.position LIMIT 1) AS portrait_url
  FROM characters c LEFT JOIN series s ON s.id = c.series_id`;

// GET /api/admin/characters?status=draft|scheduled
router.get("/characters", async function (req, res) {
  let where = " WHERE c.user_id = $1";
  if (req.query.status === "draft") where += " AND NOT c.published";
  if (req.query.status === "scheduled") where += " AND c.published AND c.publish_at > NOW()";
  const { rows } = await db.query(CHARACTER_SQL + where + " ORDER BY s.title NULLS LAST, c.sort_order NULLS LAST, c.name", [req.session.user.id]);
  res.json({ characters: rows.map(function (row) { return toCharacter(row); }) });
});

// GET /api/admin/characters/:id
router.get("/characters/:id", async function (req, res) {
  const { rows } = await db.query(CHARACTER_SQL + " WHERE c.id = $1 AND c.user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!rows.length) return res.status(404).json({ error: "That character could not be found." });
  const media = await db.query("SELECT * FROM character_media WHERE character_id = $1 ORDER BY position", [rows[0].id]);
  res.json({ character: toCharacter(rows[0], media.rows) });
});

async function saveCharacter(req, res, old) {
  const body = req.body;
  const text = function (v) { return typeof v === "string" ? v.trim() : ""; };
  const values = {
    name: text(body.name),
    role: text(body.role),
    tagline: text(body.tagline),
    profile: typeof body.profile === "string" ? body.profile.replace(/\r\n/g, "\n").trim() : "",
    seriesId: body.seriesId ? Number(body.seriesId) : null,
    sortOrder: body.sortOrder === "" || body.sortOrder === undefined || body.sortOrder === null ? null : Number(body.sortOrder),
    published: String(body.published) === "true",
    publishAt: parsePublishAt(body.publishAt)
  };
  const problems = [];
  if (!values.name || values.name.length > 120) problems.push({ field: "name", message: "Give the character a name (up to 120 characters)." });
  if (values.role.length > 80) problems.push({ field: "role", message: "Keep the role short (80 characters at most)." });
  if (values.tagline.length > 200) problems.push({ field: "tagline", message: "Keep the tagline to one sentence (200 characters at most)." });
  if (values.profile.length > 100000) problems.push({ field: "profile", message: "The profile is too long (100,000 characters at most)." });
  if (values.sortOrder !== null && (!Number.isInteger(values.sortOrder) || values.sortOrder < 0 || values.sortOrder > 10000)) {
    problems.push({ field: "sortOrder", message: "Use a whole number for the order, e.g. 1, 2, 3." });
  }
  if (Number.isNaN(values.publishAt)) problems.push({ field: "publishAt", message: "That publish date isn't valid." });
  if (values.seriesId !== null && !Number.isInteger(values.seriesId)) {
    problems.push({ field: "seriesId", message: "Choose a story from the list." });
  } else if (values.seriesId) {
    const found = await db.query("SELECT 1 FROM series WHERE id = $1 AND user_id = $2", [values.seriesId, req.session.user.id]);
    if (!found.rows.length) problems.push({ field: "seriesId", message: "That story no longer exists (or isn't yours)." });
  }
  const existingMedia = old ? (await db.query("SELECT * FROM character_media WHERE character_id = $1", [old.id])).rows : [];
  const media = resolveMedia(body.media, existingMedia, { roles: ["concept", "portrait"], kinds: ["image"], max: 60 });
  if (media.problem) problems.push({ field: "media", message: media.problem });
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  // Only one portrait: the first one marked wins.
  let seenPortrait = false;
  media.items.forEach(function (m) {
    if (m.role === "portrait") { if (seenPortrait) m.role = "concept"; seenPortrait = true; }
  });

  const slug = old && old.name === values.name ? old.slug : await uniqueSlug("characters", values.name, old && old.id);
  const client = await db.pool.connect();
  let id;
  try {
    await client.query("BEGIN");
    const fields = [slug, values.seriesId, values.name, values.role, values.tagline, values.profile,
      values.sortOrder, values.published, values.publishAt];
    if (old) {
      id = old.id;
      await client.query(
        `UPDATE characters SET slug = $1, series_id = $2, name = $3, role = $4, tagline = $5, profile = $6,
                sort_order = $7, published = $8, publish_at = $9, updated_at = NOW() WHERE id = $10`,
        fields.concat([id])
      );
      const keep = media.items.filter(function (m) { return m.id; }).map(function (m) { return m.id; });
      await client.query("DELETE FROM character_media WHERE character_id = $1 AND NOT (id = ANY ($2::int[]))", [id, keep]);
    } else {
      id = (await client.query(
        `INSERT INTO characters (slug, series_id, name, role, tagline, profile, sort_order, published, publish_at, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
        fields.concat([req.session.user.id])
      )).rows[0].id;
    }
    for (let i = 0; i < media.items.length; i++) {
      const m = media.items[i];
      if (m.id) {
        await client.query("UPDATE character_media SET position = $1, caption = $2, role = $3 WHERE id = $4", [i, m.caption, m.role, m.id]);
      } else {
        await client.query(
          "INSERT INTO character_media (character_id, position, role, url, public_id, caption) VALUES ($1, $2, $3, $4, $5, $6)",
          [id, i, m.role, m.url, m.publicId, m.caption]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await deleteAll(media.removed);
  const { rows } = await db.query(CHARACTER_SQL + " WHERE c.id = $1", [id]);
  res.status(old ? 200 : 201).json({ character: toCharacter(rows[0]) });
}

// POST /api/admin/characters
router.post("/characters", function (req, res) {
  return saveCharacter(req, res, null);
});

// PUT /api/admin/characters/:id
router.put("/characters/:id", async function (req, res) {
  const old = await db.query("SELECT * FROM characters WHERE id = $1 AND user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!old.rows.length) return res.status(404).json({ error: "That character could not be found." });
  return saveCharacter(req, res, old.rows[0]);
});

// DELETE /api/admin/characters/:id
router.delete("/characters/:id", async function (req, res) {
  const owned = await db.query("SELECT 1 FROM characters WHERE id = $1 AND user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!owned.rows.length) return res.status(404).json({ error: "That character could not be found." });
  const media = await db.query("SELECT public_id FROM character_media WHERE character_id = $1", [Number(req.params.id)]);
  const { rows } = await db.query("DELETE FROM characters WHERE id = $1 RETURNING id", [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: "That character could not be found." });
  await deleteAll(media.rows);
  res.json({ ok: true });
});

/* ---------- More products by us ---------- */

function toProduct(row) {
  return {
    id: row.id, slug: row.slug, name: row.name, tagline: row.tagline, status: row.status,
    description: row.description, link: row.link, linkLabel: row.link_label, sortOrder: row.sort_order,
    published: row.published, imageUrl: storage.thumbnailUrl(row.image_url) || null
  };
}

// GET /api/admin/products
router.get("/products", async function (req, res) {
  const { rows } = await db.query("SELECT * FROM products ORDER BY sort_order NULLS LAST, created_at DESC");
  res.json({ products: rows.map(toProduct) });
});

async function saveProduct(req, res, old) {
  const b = req.body;
  const text = function (v, max) { return typeof v === "string" ? v.trim().slice(0, max + 1) : ""; };
  const v = {
    name: text(b.name, 120), tagline: text(b.tagline, 200), status: text(b.status, 40),
    description: typeof b.description === "string" ? b.description.replace(/\r\n/g, "\n").trim() : "",
    link: text(b.link, 500), linkLabel: text(b.linkLabel, 40),
    sortOrder: b.sortOrder === "" || b.sortOrder === undefined || b.sortOrder === null ? null : Number(b.sortOrder),
    published: String(b.published) === "true"
  };
  const problems = [];
  if (!v.name || v.name.length > 120) problems.push({ field: "name", message: "Give the product a name (up to 120 characters)." });
  if (v.tagline.length > 200) problems.push({ field: "tagline", message: "Keep the tagline to 200 characters." });
  if (v.status.length > 40) problems.push({ field: "status", message: "Keep the status short, e.g. \"In development\"." });
  if (v.description.length > 20000) problems.push({ field: "description", message: "The description is too long (20,000 characters at most)." });
  if (v.link && (!/^https?:\/\/[^\s<>"]+$/i.test(v.link) || v.link.length > 500)) {
    problems.push({ field: "link", message: "Links must start with https:// (or leave it empty)." });
  }
  if (v.linkLabel.length > 40) problems.push({ field: "linkLabel", message: "Keep the button text short." });
  if (v.sortOrder !== null && (!Number.isInteger(v.sortOrder) || v.sortOrder < 0 || v.sortOrder > 10000)) {
    problems.push({ field: "sortOrder", message: "Use a whole number for the order, e.g. 1, 2, 3." });
  }
  const image = resolveCover(b.image, old && old.image_url, old && old.image_public_id);
  if (image.problem) problems.push({ field: "image", message: image.problem });
  if (problems.length) return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });

  const slug = old && old.name === v.name ? old.slug : await uniqueSlug("products", v.name, old && old.id);
  const fields = [slug, v.name, v.tagline, v.status, v.description, v.link || null, v.linkLabel,
    v.sortOrder, v.published, image.url, image.publicId];
  let row;
  if (old) {
    row = (await db.query(
      `UPDATE products SET slug = $1, name = $2, tagline = $3, status = $4, description = $5, link = $6, link_label = $7,
              sort_order = $8, published = $9, image_url = $10, image_public_id = $11, updated_at = NOW()
        WHERE id = $12 RETURNING *`,
      fields.concat([old.id])
    )).rows[0];
    if (image.changed && old.image_public_id) await storage.deleteImage(old.image_public_id);
  } else {
    row = (await db.query(
      `INSERT INTO products (slug, name, tagline, status, description, link, link_label, sort_order, published, image_url, image_public_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      fields
    )).rows[0];
  }
  res.status(old ? 200 : 201).json({ product: toProduct(row) });
}

router.post("/products", function (req, res) {
  return saveProduct(req, res, null);
});

router.put("/products/:id", async function (req, res) {
  const old = await db.query("SELECT * FROM products WHERE id = $1", [Number(req.params.id)]);
  if (!old.rows.length) return res.status(404).json({ error: "That product could not be found." });
  return saveProduct(req, res, old.rows[0]);
});

router.delete("/products/:id", async function (req, res) {
  const { rows } = await db.query("DELETE FROM products WHERE id = $1 RETURNING image_public_id", [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: "That product could not be found." });
  await storage.deleteImage(rows[0].image_public_id);
  res.json({ ok: true });
});

/* ---------- Dashboard numbers ---------- */

// GET /api/admin/overview
router.get("/overview", async function (req, res) {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM posts p WHERE ${VISIBLE} AND p.user_id = $1)::int     AS live,
       (SELECT COUNT(*) FROM posts WHERE published AND publish_at > NOW() AND user_id = $1)::int AS scheduled,
       (SELECT COUNT(*) FROM posts WHERE NOT published AND user_id = $1)::int       AS drafts,
       (SELECT COUNT(*) FROM characters WHERE (NOT published OR publish_at > NOW()) AND user_id = $1)::int AS "characterDrafts",
       (SELECT COUNT(*) FROM characters WHERE user_id = $1)::int                     AS characters,
       (SELECT COUNT(*) FROM series WHERE user_id = $1)::int                         AS stories,
       (SELECT COUNT(*) FROM creator_profiles WHERE status = 'pending')::int        AS "pendingCreators",
       (SELECT COUNT(*) FROM creator_profiles WHERE status = 'approved')::int       AS creators,
       (SELECT COUNT(*) FROM reports WHERE status = 'open')::int                    AS "openReports",
       (SELECT COUNT(*) FROM follows WHERE creator_id = $1)::int                     AS followers,
       (SELECT COUNT(*) FROM products)::int                                         AS products,
       (SELECT COUNT(*) FROM users WHERE role = 'member')::int                      AS members,
       (SELECT COUNT(*) FROM comments WHERE created_at > NOW() - INTERVAL '7 days')::int AS "commentsWeek",
       (SELECT COUNT(*) FROM likes WHERE created_at > NOW() - INTERVAL '7 days')::int    AS "likesWeek",
       (SELECT COUNT(*) FROM contact_messages WHERE read_at IS NULL)::int           AS "unreadMessages"`,
    [req.session.user.id]
  );
  const next = await db.query(
    "SELECT title, slug, publish_at FROM posts WHERE published AND publish_at > NOW() AND user_id = $1 ORDER BY publish_at LIMIT 5",
    [req.session.user.id]
  );
  res.json(Object.assign(rows[0], {
    upcoming: next.rows.map(function (r) { return { title: r.title, slug: r.slug, publishAt: r.publish_at }; })
  }));
});

/* ---------- Contact inbox ---------- */

// GET /api/admin/messages?page=1
router.get("/messages", async function (req, res) {
  const page = Math.min(10000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const size = 20;
  const total = await db.query("SELECT COUNT(*)::int AS n FROM contact_messages");
  const { rows } = await db.query(
    "SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    [size, (page - 1) * size]
  );
  res.json({
    messages: rows.map(function (r) {
      return { id: r.id, name: r.name, email: r.email, subject: r.subject, message: r.message,
        emailed: r.emailed, read: Boolean(r.read_at), createdAt: r.created_at };
    }),
    page: page,
    pages: Math.max(1, Math.ceil(total.rows[0].n / size)),
    total: total.rows[0].n
  });
});

// POST /api/admin/messages/:id/read
router.post("/messages/:id/read", async function (req, res) {
  await db.query("UPDATE contact_messages SET read_at = COALESCE(read_at, NOW()) WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

// DELETE /api/admin/messages/:id
router.delete("/messages/:id", async function (req, res) {
  await db.query("DELETE FROM contact_messages WHERE id = $1", [Number(req.params.id)]);
  res.json({ ok: true });
});

/* ---------- Social media links ---------- */

const { PLATFORMS, readSocials } = require("./search");

// PUT /api/admin/socials { links: [{ platform, url, label }] }
router.put("/socials", async function (req, res) {
  const input = Array.isArray(req.body.links) ? req.body.links : [];
  if (input.length > 20) return res.status(400).json({ error: "Up to 20 links." });
  const links = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i] || {};
    const platform = PLATFORMS[raw.platform] ? raw.platform : "other";
    let url = typeof raw.url === "string" ? raw.url.trim() : "";
    const label = typeof raw.label === "string" ? raw.label.trim().slice(0, 40) : "";
    if (!url) continue;
    if (platform === "email" && !/^mailto:/i.test(url)) url = "mailto:" + url;
    if (!/^https?:\/\/[^\s<>"]+$/i.test(url) && !/^mailto:[^\s<>"@]+@[^\s<>"]+$/i.test(url)) {
      return res.status(400).json({ error: "Link " + (i + 1) + " must start with https:// (or be an email address)." });
    }
    if (url.length > 500) return res.status(400).json({ error: "Link " + (i + 1) + " is too long." });
    links.push({ platform: platform, url: url, label: label });
  }
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('social_links', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(links)]
  );
  res.json({ links: await readSocials() });
});

/* ---------- Support / donation button ---------- */

const { SUPPORT_TYPES, readSupport } = require("./search");

// PUT /api/admin/support { enabled, title, message, methods: [{ type, label, url, provider, number, name, details }] }
router.put("/support", async function (req, res) {
  const b = req.body || {};
  const text = function (v, max) { return typeof v === "string" ? v.trim().slice(0, max) : ""; };
  const input = Array.isArray(b.methods) ? b.methods : [];
  if (input.length > 8) return res.status(400).json({ error: "Up to 8 ways to support." });
  const methods = [];
  for (let i = 0; i < input.length; i++) {
    const m = input[i] || {};
    const type = SUPPORT_TYPES.includes(m.type) ? m.type : "link";
    const method = {
      type: type,
      label: text(m.label, 40),
      url: text(m.url, 500),
      provider: text(m.provider, 40),
      number: text(m.number, 30),
      name: text(m.name, 80),
      details: text(m.details, 400)
    };
    const n = i + 1;
    if (method.url && !/^https:\/\/[^\s<>"]+$/i.test(method.url)) {
      return res.status(400).json({ error: "Way " + n + ": links must start with https://" });
    }
    if ((type === "card" || type === "paypal" || type === "link") && !method.url) {
      return res.status(400).json({ error: "Way " + n + ": add the payment link (https://...)." });
    }
    if (type === "mobile-money" && !/^\+?[0-9 ]{9,16}$/.test(method.number)) {
      return res.status(400).json({ error: "Way " + n + ": enter the mobile money number, e.g. 097 123 4567." });
    }
    methods.push(method);
  }
  const support = {
    enabled: b.enabled === true || b.enabled === "true",
    title: text(b.title, 60) || "Fund the heist",
    message: text(b.message, 400),
    methods: methods
  };
  if (support.enabled && !methods.length) {
    return res.status(400).json({ error: "Add at least one way to support before switching the button on." });
  }
  await db.query(
    `INSERT INTO app_settings (key, value) VALUES ('support', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(support)]
  );
  res.json({ support: support });
});

// GET /api/admin/support -> the saved settings, even while the button is off
router.get("/support", async function (req, res) {
  res.json({ support: await readSupport() });
});

/* ---------- Afterframe moderation: creator applications and reports ---------- */

const { sendMail, mailEnabled: canEmail } = require("../mail");

function toCreatorAdmin(row) {
  return {
    userId: row.user_id, handle: row.handle, name: row.name, tagline: row.tagline, kinds: row.kinds,
    status: row.status, application: row.application, reviewNote: row.review_note,
    featured: row.featured, canWriteNews: row.can_write_news, createdAt: row.created_at, approvedAt: row.approved_at,
    username: row.username, email: row.email ? row.email.replace(/^(.).*(@.*)$/, "$1…$2") : null,
    avatarUrl: storage.avatarUrl(row.avatar_url) || null, works: row.works || 0, followers: row.followers || 0,
    links: (function () { try { return JSON.parse(row.links || "[]"); } catch (e) { return []; } })()
  };
}

// GET /api/admin/creators?status=pending|approved|rejected|suspended
router.get("/creators", async function (req, res) {
  const status = ["pending", "approved", "rejected", "suspended"].includes(req.query.status) ? req.query.status : null;
  const { rows } = await db.query(
    `SELECT cp.*, u.username, u.email, u.avatar_url,
       (SELECT COUNT(*) FROM posts p WHERE p.user_id = cp.user_id)::int AS works,
       (SELECT COUNT(*) FROM follows f WHERE f.creator_id = cp.user_id)::int AS followers
       FROM creator_profiles cp JOIN users u ON u.id = cp.user_id
      WHERE u.role <> 'admin' ${status ? "AND cp.status = $1" : ""}
      ORDER BY (cp.status = 'pending') DESC, cp.created_at DESC LIMIT 200`,
    status ? [status] : []
  );
  res.json({ creators: rows.map(toCreatorAdmin) });
});

// POST /api/admin/creators/:id/review { status, note, featured, canWriteNews }
router.post("/creators/:id/review", async function (req, res) {
  const status = ["pending", "approved", "rejected", "suspended"].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: "Choose approve, reject or suspend." });
  const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 500) : "";
  const { rows } = await db.query(
    `UPDATE creator_profiles cp SET status = $1::varchar, review_note = $2,
            featured = COALESCE($3::boolean, featured), can_write_news = COALESCE($4::boolean, can_write_news),
            approved_at = CASE WHEN $1::varchar = 'approved' THEN COALESCE(approved_at, NOW()) ELSE approved_at END
       FROM users u
      WHERE cp.user_id = $5 AND u.id = cp.user_id AND u.role <> 'admin'
      RETURNING cp.*, u.username, u.email, u.display_name, u.avatar_url`,
    [status, note,
      typeof req.body.featured === "boolean" ? req.body.featured : null,
      typeof req.body.canWriteNews === "boolean" ? req.body.canWriteNews : null,
      Number(req.params.id)]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "That creator could not be found." });

  // Tell them by email when they're approved or turned down (if email is set up and they gave one).
  let emailed = false;
  if (row.email && canEmail() && (status === "approved" || status === "rejected") && req.body.notify !== false) {
    const site = (process.env.PUBLIC_URL || req.protocol + "://" + req.get("host")).replace(/\/+$/, "");
    const approved = status === "approved";
    const text = approved
      ? "Hi " + row.display_name + ",\n\nYour Afterframe creator profile (@" + row.handle + ") has been approved.\n\n" +
        "Open your studio to publish your first work: " + site + "/hub/studio\n" + (note ? "\nNote from the team: " + note + "\n" : "")
      : "Hi " + row.display_name + ",\n\nThanks for applying to be an Afterframe creator. We can't approve your profile right now." +
        (note ? "\n\nNote from the team: " + note : "") + "\n\nYou're welcome to update your application and apply again: " + site + "/hub/apply\n";
    try {
      await sendMail(row.email, approved ? "You're in: welcome to Afterframe" : "Your Afterframe application", text,
        "<p>" + text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") + "</p>");
      emailed = true;
    } catch (error) {
      console.error("Creator review email failed:", error.message);
    }
  }
  res.json({ creator: toCreatorAdmin(row), emailed: emailed });
});

// GET /api/admin/reports?status=open
router.get("/reports", async function (req, res) {
  const status = ["open", "resolved", "dismissed"].includes(req.query.status) ? req.query.status : "open";
  const { rows } = await db.query(
    `SELECT r.*, u.username AS reporter,
       CASE r.target_type
         WHEN 'post' THEN (SELECT json_build_object('title', p.title, 'slug', p.slug, 'id', p.id, 'creator', cp.handle)
                             FROM posts p LEFT JOIN creator_profiles cp ON cp.user_id = p.user_id WHERE p.id = r.target_id)
         WHEN 'comment' THEN (SELECT json_build_object('body', c.body, 'id', c.id, 'slug', p.slug, 'author', cu.username)
                                FROM comments c JOIN posts p ON p.id = c.post_id JOIN users cu ON cu.id = c.user_id WHERE c.id = r.target_id)
         WHEN 'creator' THEN (SELECT json_build_object('handle', cp.handle, 'name', cp.name, 'id', cp.user_id, 'status', cp.status)
                                FROM creator_profiles cp WHERE cp.user_id = r.target_id)
       END AS target
       FROM reports r LEFT JOIN users u ON u.id = r.reporter_id
      WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 100`,
    [status]
  );
  res.json({
    reports: rows.map(function (r) {
      return { id: r.id, targetType: r.target_type, targetId: r.target_id, reason: r.reason, details: r.details,
        status: r.status, reporter: r.reporter, createdAt: r.created_at, target: r.target };
    })
  });
});

// POST /api/admin/reports/:id { status: resolved | dismissed }
router.post("/reports/:id", async function (req, res) {
  const status = ["resolved", "dismissed", "open"].includes(req.body.status) ? req.body.status : null;
  if (!status) return res.status(400).json({ error: "Choose resolved or dismissed." });
  await db.query(
    "UPDATE reports SET status = $1::varchar, resolved_at = CASE WHEN $1::varchar = 'open' THEN NULL ELSE NOW() END WHERE id = $2",
    [status, Number(req.params.id)]
  );
  res.json({ ok: true });
});

/* ---------- Uploading media for works ---------- */

// GET /api/admin/media/ticket -> how the browser should upload the next file:
//   { mode: "cloudinary", uploadUrl, fields, limitsMb }  straight to Cloudinary, or
//   { mode: "local", limitsMb }                            to POST /api/admin/media (laptop)
// ?kind=document for PDFs, Word files and other downloads.
router.get("/media/ticket", function (req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (storage.useCloudinary) return res.json(storage.signUpload(req.query.kind === "document" ? "document" : "media"));
  res.json({ mode: "local", limitsMb: storage.LIMITS_MB });
});

// POST /api/admin/media  (laptop mode only: multipart "file")
router.post("/media", function (req, res, next) {
  if (storage.useCloudinary) {
    return res.status(400).json({ error: "Uploads go straight to Cloudinary on this site." });
  }
  storage.mediaUpload.single("file")(req, res, async function (error) {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "That file is too big (100 MB at most)." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a file first." });
    try {
      res.status(201).json({ local: await storage.saveMediaFile(req.file) });
    } catch (saveError) {
      res.status(400).json({ error: saveError.message });
    }
  });
});

/* ---------- Importing writing from a file ---------- */

// Word's Markdown uses __bold__ and backslash escapes; the editor uses **bold** and plain text.
function tidyMarkdown(text) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")              // pictures inside the document
    .replace(/<a id="[^"]*"><\/a>/g, "")                // Word bookmarks
    .replace(/__([^_\n][^\n]*?)__/g, "**$1**")
    .replace(/\\([\\`*_{}[\]()#+\-.!>])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// POST /api/admin/import-document  (multipart "file": .docx, .txt or .md) -> { text, words }
router.post("/import-document", function (req, res) {
  storage.documentUpload.single("file")(req, res, async function (error) {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "That file is bigger than 5 MB." : error.message;
      return res.status(400).json({ error: message });
    }
    if (!req.file) return res.status(400).json({ error: "Choose a file first." });

    let text;
    try {
      if (/\.docx$/i.test(req.file.originalname)) {
        const mammoth = require("mammoth");
        const result = await mammoth.convertToMarkdown({ buffer: req.file.buffer });
        text = tidyMarkdown(result.value);
      } else {
        text = req.file.buffer.toString("utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n").trim();
      }
    } catch (readError) {
      return res.status(400).json({ error: "That file couldn't be read. If it's a Word file, save it as .docx and try again." });
    }
    if (!text) return res.status(400).json({ error: "That file has no text in it." });
    res.json({ text: text.slice(0, 200000), words: text.split(/\s+/).filter(Boolean).length, truncated: text.length > 200000 });
  });
});

module.exports = router;
