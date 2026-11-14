// src/routes/posts.js
// Works (story art, anime works, writing): list, view, create/edit/delete (admin only),
// plus likes, favourites and comments.

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireLogin, requireAdmin } = require("../auth");
const { upload, saveImage, deleteImage, thumbnailUrl } = require("../storage");

const router = express.Router();

// Any route with ":id" in it only accepts a whole number; anything else is "not found".
router.param("id", function (req, res, next, value) {
  if (!/^\d{1,9}$/.test(value)) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  next();
});

const CATEGORIES = ["story-art", "anime", "writing"];
const PAGE_SIZE = 12;

const commentLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "You are commenting very fast. Please wait a few minutes." }
});

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// "A Year to Burn: Cover" -> "a-year-to-burn-cover"
function slugify(title) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "work";
}

async function uniqueSlug(title, ignoreId) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  for (;;) {
    const { rows } = await db.query(
      "SELECT id FROM posts WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)",
      [slug, ignoreId || null]
    );
    if (!rows.length) return slug;
    slug = base + "-" + n;
    n += 1;
  }
}

// Turns a database row into the shape the browser uses.
function toPost(row, full) {
  const post = {
    id: row.id,
    slug: row.slug,
    category: row.category,
    title: row.title,
    summary: row.summary,
    imageUrl: full ? row.image_url : thumbnailUrl(row.image_url),
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likes: row.likes || 0,
    comments: row.comments || 0
  };
  if (full) {
    post.body = row.body;
    post.liked = Boolean(row.liked);
    post.favourited = Boolean(row.favourited);
  }
  return post;
}

function validatePost(body) {
  const values = {
    title: cleanText(body.title),
    category: cleanText(body.category),
    summary: cleanText(body.summary),
    body: typeof body.body === "string" ? body.body.replace(/\r\n/g, "\n").trim() : "",
    published: body.published === undefined ? true : String(body.published) === "true"
  };
  const problems = [];
  if (!values.title || values.title.length > 120) {
    problems.push({ field: "title", message: "Give the work a title (up to 120 characters)." });
  }
  if (!CATEGORIES.includes(values.category)) {
    problems.push({ field: "category", message: "Choose Story art, Anime works or Writing." });
  }
  if (values.summary.length > 300) {
    problems.push({ field: "summary", message: "Keep the short description to 300 characters." });
  }
  if (values.body.length > 50000) {
    problems.push({ field: "body", message: "The text is too long (50,000 characters at most)." });
  }
  return { values: values, problems: problems };
}

// Runs multer, and turns its errors (wrong type, too big) into a friendly 400 response.
function acceptImage(req, res, next) {
  upload.single("image")(req, res, function (error) {
    if (error) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "Images must be 8 MB or smaller." : error.message;
      return res.status(400).json({ error: message, problems: [{ field: "image", message: message }] });
    }
    next();
  });
}

const STATS_SQL = `
  (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id)::int    AS likes,
  (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)::int AS comments`;

/* ---------- Reading ---------- */

// GET /api/posts?category=anime&page=1
router.get("/", async function (req, res) {
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const isAdmin = req.session.user && req.session.user.role === "admin";
  const showDrafts = isAdmin && req.query.drafts === "1";

  const where = [];
  const values = [];
  if (!showDrafts) where.push("p.published = TRUE");
  if (category) {
    values.push(category);
    where.push("p.category = $" + values.length);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = await db.query("SELECT COUNT(*)::int AS n FROM posts p " + whereSql, values);

  values.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const { rows } = await db.query(
    `SELECT p.*, ${STATS_SQL}
       FROM posts p ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  res.json({
    posts: rows.map(function (row) { return toPost(row, false); }),
    page: page,
    pages: Math.max(1, Math.ceil(total.rows[0].n / PAGE_SIZE)),
    total: total.rows[0].n
  });
});

// GET /api/posts/:slug
router.get("/:slug", async function (req, res) {
  const userId = req.session.user ? req.session.user.id : null;
  const isAdmin = req.session.user && req.session.user.role === "admin";

  const { rows } = await db.query(
    `SELECT p.*, ${STATS_SQL},
       EXISTS (SELECT 1 FROM likes l WHERE l.post_id = p.id AND l.user_id = $2)      AS liked,
       EXISTS (SELECT 1 FROM favourites f WHERE f.post_id = p.id AND f.user_id = $2) AS favourited
       FROM posts p
      WHERE p.slug = $1`,
    [req.params.slug, userId]
  );

  const row = rows[0];
  if (!row || (!row.published && !isAdmin)) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  res.json({ post: toPost(row, true) });
});

/* ---------- Admin: create, edit, delete ---------- */

// GET /api/posts/by-id/:id  (admin: load a work, drafts included, for the edit form)
router.get("/by-id/:id", requireAdmin, async function (req, res) {
  const { rows } = await db.query(`SELECT p.*, ${STATS_SQL} FROM posts p WHERE p.id = $1`, [Number(req.params.id)]);
  if (!rows.length) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  res.json({ post: toPost(rows[0], true) });
});

// POST /api/posts  (multipart form: title, category, summary, body, published, image)
router.post("/", requireAdmin, acceptImage, async function (req, res) {
  const { values, problems } = validatePost(req.body);
  if (values.category !== "writing" && !req.file) {
    problems.push({ field: "image", message: "Story art and anime works need an image." });
  }
  if (problems.length) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }

  let image = { url: null, publicId: null };
  if (req.file) {
    try {
      image = await saveImage(req.file);
    } catch (error) {
      return res.status(400).json({ error: error.message, problems: [{ field: "image", message: error.message }] });
    }
  }

  const slug = await uniqueSlug(values.title);
  const { rows } = await db.query(
    `INSERT INTO posts (slug, category, title, summary, body, image_url, image_public_id, published)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [slug, values.category, values.title, values.summary, values.body, image.url, image.publicId, values.published]
  );
  res.status(201).json({ post: toPost(rows[0], true) });
});

// PUT /api/posts/:id  (same fields; image is optional, removeImage=true clears it)
router.put("/:id", requireAdmin, acceptImage, async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const existing = await db.query("SELECT * FROM posts WHERE id = $1", [id]);
  if (!existing.rows.length) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  const old = existing.rows[0];

  const { values, problems } = validatePost(req.body);
  const removeImage = String(req.body.removeImage) === "true";
  const willHaveImage = Boolean(req.file) || (old.image_url && !removeImage);
  if (values.category !== "writing" && !willHaveImage) {
    problems.push({ field: "image", message: "Story art and anime works need an image." });
  }
  if (problems.length) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }

  let imageUrl = old.image_url;
  let imagePublicId = old.image_public_id;
  if (req.file) {
    try {
      const saved = await saveImage(req.file);
      imageUrl = saved.url;
      imagePublicId = saved.publicId;
    } catch (error) {
      return res.status(400).json({ error: error.message, problems: [{ field: "image", message: error.message }] });
    }
  } else if (removeImage) {
    imageUrl = null;
    imagePublicId = null;
  }

  const slug = values.title === old.title ? old.slug : await uniqueSlug(values.title, id);
  const { rows } = await db.query(
    `UPDATE posts
        SET slug = $1, category = $2, title = $3, summary = $4, body = $5,
            image_url = $6, image_public_id = $7, published = $8, updated_at = NOW()
      WHERE id = $9 RETURNING *`,
    [slug, values.category, values.title, values.summary, values.body, imageUrl, imagePublicId, values.published, id]
  );

  if (old.image_public_id && old.image_public_id !== imagePublicId) {
    await deleteImage(old.image_public_id);
  }
  res.json({ post: toPost(rows[0], true) });
});

// DELETE /api/posts/:id
router.delete("/:id", requireAdmin, async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const { rows } = await db.query("DELETE FROM posts WHERE id = $1 RETURNING image_public_id", [id]);
  if (!rows.length) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  await deleteImage(rows[0].image_public_id);
  res.json({ ok: true });
});

/* ---------- Members: likes and favourites ---------- */

async function findPublishedPost(id) {
  const { rows } = await db.query("SELECT id FROM posts WHERE id = $1 AND published = TRUE", [id]);
  return rows[0];
}

// One function handles like/unlike and save/unsave, because they work the same way.
function toggleRoute(table, column) {
  return async function (req, res) {
    const id = parseInt(req.params.id, 10);
    if (!(await findPublishedPost(id))) {
      return res.status(404).json({ error: "That work could not be found." });
    }
    if (req.method === "POST") {
      await db.query(
        `INSERT INTO ${table} (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.session.user.id, id]
      );
    } else {
      await db.query(`DELETE FROM ${table} WHERE user_id = $1 AND post_id = $2`, [req.session.user.id, id]);
    }
    const count = await db.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE post_id = $1`, [id]);
    const result = { count: count.rows[0].n };
    result[column] = req.method === "POST";
    res.json(result);
  };
}

router.post("/:id/like", requireLogin, toggleRoute("likes", "liked"));
router.delete("/:id/like", requireLogin, toggleRoute("likes", "liked"));
router.post("/:id/favourite", requireLogin, toggleRoute("favourites", "favourited"));
router.delete("/:id/favourite", requireLogin, toggleRoute("favourites", "favourited"));

/* ---------- Comments ---------- */

function toComment(row, viewer) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: { username: row.username, displayName: row.display_name, role: row.role },
    canDelete: Boolean(viewer && (viewer.role === "admin" || viewer.id === row.user_id))
  };
}

// GET /api/posts/:id/comments
router.get("/:id/comments", async function (req, res) {
  const id = parseInt(req.params.id, 10);
  if (!(await findPublishedPost(id))) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  const { rows } = await db.query(
    `SELECT c.*, u.username, u.display_name, u.role
       FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
      LIMIT 500`,
    [id]
  );
  res.json({ comments: rows.map(function (row) { return toComment(row, req.session.user); }) });
});

// POST /api/posts/:id/comments  { body }
router.post("/:id/comments", requireLogin, commentLimiter, async function (req, res) {
  const id = parseInt(req.params.id, 10);
  const body = cleanText(req.body.body);
  if (!body || body.length > 1000) {
    return res.status(400).json({ error: "Comments must be between 1 and 1000 characters." });
  }
  if (!(await findPublishedPost(id))) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  const { rows } = await db.query(
    `WITH c AS (INSERT INTO comments (post_id, user_id, body) VALUES ($1, $2, $3) RETURNING *)
     SELECT c.*, u.username, u.display_name, u.role FROM c JOIN users u ON u.id = c.user_id`,
    [id, req.session.user.id, body]
  );
  res.status(201).json({ comment: toComment(rows[0], req.session.user) });
});

module.exports = router;
