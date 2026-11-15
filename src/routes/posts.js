// src/routes/posts.js
// Works (story art, anime works, writing): list (with search, sort, tag and series filters),
// view (with next / previous links), create / edit / delete (admin only),
// plus likes, favourites and comments (with replies).

const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const { requireLogin, requireCreator } = require("../auth");
const storage = require("../storage");
const { resolveMedia, parsePublishAt, statusOf, deleteAll } = require("../media");

const router = express.Router();

// Any route with ":id" in it only accepts a whole number; anything else is "not found".
router.param("id", function (req, res, next, value) {
  if (!/^\d{1,9}$/.test(value)) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  next();
});

const CATEGORIES = ["story-art", "anime", "writing", "updates", "news", "art", "comedy", "film", "series", "meme", "thoughts", "poll", "novel", "storybook", "educational", "poetry", "song"];
const NEEDS_VISUAL = ["story-art", "anime", "art", "meme"];
const SECTIONS = ["main", "concept-art"];
const FONTS = ["theme", "serif", "typewriter", "handwritten", "clean"];

// A work is public once it's published, its publish time (if any) has passed,
// and its creator is approved (a suspended creator's works disappear everywhere).
const VISIBLE = "(p.published AND p.review_status = 'approved' AND (p.publish_at IS NULL OR p.publish_at <= NOW()) AND EXISTS " +
  "(SELECT 1 FROM creator_profiles cpv WHERE cpv.user_id = p.user_id AND cpv.status = 'approved'))";

// God's Banditos shows only the admin's own works; Chapterhive (/hub) shows every creator's.
const BANDITOS_ONLY = "p.user_id IN (SELECT id FROM users WHERE role = 'admin')";
const SORTS = ["new", "old", "popular", "series"];

// Browsing on the Chapterhive dashboard: shelves (groups of categories) and genres.
const SHELVES = {
  books: ["novel", "storybook", "educational"],
  comics: ["story-art"],
  art: ["art", "meme"],
  video: ["anime", "film", "series"],
  music: ["song", "poetry"],
  writing: ["writing", "thoughts", "poetry", "novel"],
  comedy: ["comedy", "meme"]
};
const GENRES = ["fantasy", "scifi", "horror", "mystery", "romance", "comedy", "drama", "action", "adventure", "thriller",
  "slice-of-life", "historical", "children", "young-adult", "education", "science", "self-help", "faith", "poetry", "music"];
const PAGE_SIZE = 12;
const MAX_MEDIA = 80;
const plans = require("../plans");
const { requireFlag } = require("../flags");
const MAX_TAGS = 12;

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

async function uniqueSlug(table, title, ignoreId) {
  const base = slugify(title);
  let slug = base;
  let n = 2;
  for (;;) {
    const { rows } = await db.query(
      `SELECT id FROM ${table} WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)`,
      [slug, ignoreId || null]
    );
    if (!rows.length) return slug;
    slug = base + "-" + n;
    n += 1;
  }
}

// "Aldenmere, Sketch,  fan art" -> ["aldenmere", "sketch", "fan-art"]
function cleanTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  const tags = [];
  list.forEach(function (raw) {
    const tag = String(raw).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
    if (tag && !tags.includes(tag)) tags.push(tag);
  });
  return tags.slice(0, MAX_TAGS);
}

// Turns a database row into the shape the browser uses.
function toPost(row, full) {
  const post = {
    id: row.id,
    slug: row.slug,
    category: row.category,
    title: row.title,
    summary: row.summary,
    logline: row.logline || "",
    section: row.section || "main",
    font: row.font || "theme",
    publishAt: row.publish_at,
    status: statusOf(row),
    reviewStatus: row.review_status || "approved",
    hasForm: Boolean(row.form),
    imageUrl: full ? storage.displayUrl(row.image_url, "image") : storage.thumbnailUrl(row.image_url),
    tags: row.tags || [],
    genres: row.genres || [],
    creator: row.creator_handle ? {
      handle: row.creator_handle,
      name: row.creator_name,
      avatarUrl: storage.avatarUrl(row.creator_avatar) || null,
      isBanditos: row.owner_role === "admin"
    } : null,
    series: row.series_id ? { id: row.series_id, slug: row.series_slug, title: row.series_title } : null,
    seriesOrder: row.series_order,
    mediaCount: row.media_count || 0,
    hasVideo: Boolean(row.has_video),
    hasAudio: Boolean(row.has_audio),
    published: row.published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    likes: row.likes || 0,
    comments: row.comments || 0
  };
  if (full) {
    post.body = row.body;
    post.form = row.form || null;
    post.reviewNote = row.review_note || "";
    post.liked = Boolean(row.liked);
    post.favourited = Boolean(row.favourited);
  }
  return post;
}

function toMedia(row) {
  return {
    id: row.id,
    kind: row.kind,
    url: storage.displayUrl(row.url, row.kind),
    originalUrl: row.url,
    thumbUrl: row.kind === "image" ? storage.thumbnailUrl(row.url) : row.kind === "video" ? storage.posterUrl(row.url) : null,
    caption: row.caption,
    role: row.role || "page"
  };
}

async function mediaFor(postId) {
  const { rows } = await db.query("SELECT * FROM post_media WHERE post_id = $1 ORDER BY position, id", [postId]);
  return rows.map(toMedia);
}

const SELECT_POST = `
  SELECT p.*, s.slug AS series_slug, s.title AS series_title,
    cp.handle AS creator_handle, cp.name AS creator_name, ou.role AS owner_role, ou.avatar_url AS creator_avatar,
    (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id)::int    AS likes,
    (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)::int AS comments,
    (SELECT COUNT(*) FROM post_media m WHERE m.post_id = p.id AND m.role = 'page' AND m.kind <> 'document')::int AS media_count,
    EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.kind = 'video') AS has_video,
    EXISTS (SELECT 1 FROM post_media m WHERE m.post_id = p.id AND m.kind = 'audio') AS has_audio
  FROM posts p LEFT JOIN series s ON s.id = p.series_id
    LEFT JOIN users ou ON ou.id = p.user_id
    LEFT JOIN creator_profiles cp ON cp.user_id = p.user_id`;

/* ---------- Reading ---------- */

// GET /api/posts?category=anime&q=fire&tag=sketch&series=a-year-to-burn&sort=popular&page=1
router.get("/", async function (req, res) {
  const category = CATEGORIES.includes(req.query.category) ? req.query.category : null;
  const page = Math.min(10000, Math.max(1, parseInt(req.query.page, 10) || 1));
  const me = req.session.user;
  // ?drafts=1 (or ?mine=1): your own works, drafts and scheduled ones included (dashboard / studio).
  const showDrafts = Boolean(me) && (req.query.drafts === "1" || req.query.mine === "1");
  const site = req.query.site === "hub" ? "hub" : "banditos";
  const creatorHandle = typeof req.query.creator === "string" ? req.query.creator.toLowerCase().slice(0, 30) : "";
  const search = cleanText(req.query.q).slice(0, 80);
  const tag = typeof req.query.tag === "string" ? cleanTags([req.query.tag])[0] || null : null;
  const seriesSlug = typeof req.query.series === "string" ? req.query.series.slice(0, 120) : "";
  let sort = SORTS.includes(req.query.sort) ? req.query.sort : seriesSlug ? "series" : "new";
  if (sort === "series" && !seriesSlug) sort = "new";

  const where = [];
  const values = [];
  if (showDrafts) {
    values.push(me.id);
    where.push("p.user_id = $" + values.length);
  } else {
    where.push(VISIBLE);
    if (creatorHandle) {
      values.push(creatorHandle);
      where.push("cp.handle = $" + values.length);
    } else if (site === "banditos") {
      where.push(BANDITOS_ONLY);
    }
  }
  // Dashboard filters: ?drafts=1&status=draft|scheduled|live
  if (showDrafts && req.query.status === "draft") where.push("NOT p.published");
  if (showDrafts && req.query.status === "scheduled") where.push("p.published AND p.publish_at > NOW()");
  if (showDrafts && req.query.status === "live") where.push(VISIBLE);
  if (showDrafts && req.query.status === "pending") where.push("p.published AND p.review_status = 'pending'");
  if (showDrafts && req.query.status === "declined") where.push("p.review_status = 'declined'");
  const section = SECTIONS.includes(req.query.section) ? req.query.section : null;
  if (section) {
    values.push(section);
    where.push("p.section = $" + values.length);
  }
  if (category) {
    values.push(category);
    where.push("p.category = $" + values.length);
  } else if (!showDrafts) {
    where.push("p.category <> 'news'"); // news posts have their own section on Chapterhive
  }
  if (tag) {
    values.push(tag);
    where.push("$" + values.length + " = ANY (p.tags)");
  }
  // ?shelf=books  (a group of categories)   ?genre=horror  (chosen genre, or a matching tag)
  if (!category && SHELVES[req.query.shelf]) {
    values.push(SHELVES[req.query.shelf]);
    where.push("p.category = ANY ($" + values.length + "::text[])");
  }
  if (GENRES.includes(req.query.genre)) {
    values.push(req.query.genre);
    where.push("($" + values.length + "::varchar = ANY (p.genres) OR $" + values.length + "::varchar = ANY (p.tags))");
  }
  if (seriesSlug) {
    values.push(seriesSlug);
    where.push("s.slug = $" + values.length);
  }
  if (search) {
    // Escape % and _ so they are searched for literally.
    values.push("%" + search.replace(/[\\%_]/g, "\\$&") + "%");
    const n = "$" + values.length;
    where.push(`(p.title ILIKE ${n} OR p.summary ILIKE ${n} OR p.logline ILIKE ${n} OR array_to_string(p.tags, ' ') ILIKE ${n} OR s.title ILIKE ${n})`);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const orderSql = {
    new: "p.created_at DESC, p.id DESC",
    old: "p.created_at ASC, p.id ASC",
    popular: "likes DESC, comments DESC, p.created_at DESC",
    series: "p.series_order ASC NULLS LAST, p.created_at ASC"
  }[sort];

  const total = await db.query(
    "SELECT COUNT(*)::int AS n FROM posts p LEFT JOIN series s ON s.id = p.series_id " +
    "LEFT JOIN creator_profiles cp ON cp.user_id = p.user_id " + whereSql,
    values
  );

  values.push(PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const { rows } = await db.query(
    `${SELECT_POST} ${whereSql}
      ORDER BY ${orderSql}
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  res.json({
    posts: rows.map(function (row) { return toPost(row, false); }),
    page: page,
    pages: Math.max(1, Math.ceil(total.rows[0].n / PAGE_SIZE)),
    total: total.rows[0].n,
    sort: sort
  });
});

// GET /api/posts/meta/filters -> the series and tags that have published works (for the gallery filters)
router.get("/meta/filters", async function (req, res) {
  const scope = req.query.site === "hub" ? "" : " AND " + BANDITOS_ONLY;
  const series = await db.query(
    `SELECT s.slug, s.title, COUNT(p.id)::int AS works
       FROM series s JOIN posts p ON p.series_id = s.id AND ${VISIBLE}${scope}
      GROUP BY s.id ORDER BY s.title`
  );
  const tags = await db.query(
    `SELECT tag, COUNT(*)::int AS works
       FROM posts p, unnest(p.tags) AS tag
      WHERE ${VISIBLE}${scope} AND p.category <> 'news'
      GROUP BY tag ORDER BY works DESC, tag LIMIT 40`
  );
  res.json({ series: series.rows, tags: tags.rows });
});

// Previous / next published works: by date overall, and by chapter number inside a series.
async function neighbours(row) {
  // Older / newer works by the same creator (news posts only lead to other updates).
  const brief = "SELECT p.slug, p.title, p.series_order FROM posts p WHERE " + VISIBLE +
    " AND p.section = 'main' AND p.id <> $1 AND p.user_id = " + Number(row.user_id) +
    (row.category === "news" ? " AND p.category = 'news'" : " AND p.category <> 'news'");
  const older = await db.query(
    brief + " AND (p.created_at, p.id) < ($2, $1) ORDER BY p.created_at DESC, p.id DESC LIMIT 1",
    [row.id, row.created_at]
  );
  const newer = await db.query(
    brief + " AND (p.created_at, p.id) > ($2, $1) ORDER BY p.created_at ASC, p.id ASC LIMIT 1",
    [row.id, row.created_at]
  );
  const result = { older: older.rows[0] || null, newer: newer.rows[0] || null, series: null };

  if (row.series_id) {
    // Works without a chapter number count as coming after the numbered ones, in date order.
    const all = await db.query(
      `SELECT p.id, p.slug, p.title, p.series_order FROM posts p
        WHERE p.series_id = $1 AND p.section = 'main' AND (${VISIBLE} OR p.id = $2)
        ORDER BY p.series_order ASC NULLS LAST, p.created_at ASC, p.id ASC`,
      [row.series_id, row.id]
    );
    const index = all.rows.findIndex(function (r) { return r.id === row.id; });
    const pick = function (r) { return r ? { slug: r.slug, title: r.title, seriesOrder: r.series_order } : null; };
    result.series = {
      slug: row.series_slug,
      title: row.series_title,
      position: index + 1,
      count: all.rows.length,
      prev: pick(all.rows[index - 1]),
      next: pick(all.rows[index + 1])
    };
  }
  return result;
}

// GET /api/posts/:slug
router.get("/:slug", async function (req, res) {
  const userId = req.session.user ? req.session.user.id : null;
  const isAdmin = req.session.user && req.session.user.role === "admin";

  const { rows } = await db.query(
    `SELECT q.*, ${VISIBLE.replace(/\bp\./g, "q.")} AS visible,
       EXISTS (SELECT 1 FROM likes l WHERE l.post_id = q.id AND l.user_id = $2)      AS liked,
       EXISTS (SELECT 1 FROM favourites f WHERE f.post_id = q.id AND f.user_id = $2) AS favourited
       FROM (${SELECT_POST} WHERE p.slug = $1) q`,
    [req.params.slug, userId]
  );

  const row = rows[0];
  // Drafts, scheduled works and works of suspended creators: only their owner (and the admin) can open them.
  if (!row || (!row.visible && !isAdmin && row.user_id !== userId)) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  const post = toPost(row, true);
  post.isMine = Boolean(userId && row.user_id === userId);
  post.media = await mediaFor(row.id);
  post.nav = await neighbours(row);
  // Visitors without an account get a preview: the opening of the text and the first few images.
  // Video, audio, documents and forms stay locked until they sign up.
  // On God's Banditos the owner's own works are shown in full to everyone (view only).
  const banditosPage = req.query.site === "gb" && row.owner_role === "admin";
  if (!userId && !banditosPage) guestPreview(post);
  if (row.form && userId) {
    const mine = await db.query("SELECT answers FROM form_responses WHERE post_id = $1 AND user_id = $2", [row.id, userId]);
    post.myResponse = mine.rows[0] ? mine.rows[0].answers : null;
  }
  res.json({ post: post });
});

const PREVIEW_CHARS = 700;
const PREVIEW_IMAGES = 3;

function guestPreview(post) {
  const body = post.body || "";
  let locked = false;
  if (body.length > PREVIEW_CHARS) {
    let cut = body.lastIndexOf("\n\n", PREVIEW_CHARS);
    if (cut < PREVIEW_CHARS / 2) cut = body.lastIndexOf(" ", PREVIEW_CHARS);
    if (cut < 1) cut = PREVIEW_CHARS;
    post.body = body.slice(0, cut).trim() + " …";
    locked = true;
  }
  const images = [];
  let hidden = 0;
  (post.media || []).forEach(function (m) {
    if (m.kind === "image" && images.length < PREVIEW_IMAGES) images.push(m);
    else hidden += 1;
  });
  post.media = images;
  if (post.form) { post.form = null; locked = true; }
  post.preview = true;
  post.lockedMedia = hidden;
  post.locked = locked || hidden > 0;
  return post;
}

/* ---------- Admin: create, edit, delete ---------- */

// GET /api/posts/by-id/:id  (admin: load a work, drafts included, for the edit form)
router.get("/by-id/:id", requireCreator, async function (req, res) {
  const { rows } = await db.query(SELECT_POST + " WHERE p.id = $1 AND p.user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!rows.length) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  const post = toPost(rows[0], true);
  post.media = await mediaFor(rows[0].id);
  res.json({ post: post });
});

function optionalInt(value, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
}

async function validatePost(body, req) {
  const values = {
    title: cleanText(body.title),
    category: cleanText(body.category),
    summary: cleanText(body.summary),
    body: typeof body.body === "string" ? body.body.replace(/\r\n/g, "\n").trim() : "",
    published: body.published === undefined ? true : String(body.published) === "true",
    logline: cleanText(body.logline),
    section: SECTIONS.includes(body.section) ? body.section : "main",
    font: FONTS.includes(body.font) ? body.font : "theme",
    form: null,
    publishAt: parsePublishAt(body.publishAt),
    tags: cleanTags(body.tags),
    genres: (Array.isArray(body.genres) ? body.genres : []).filter(function (g, i, all) { return GENRES.includes(g) && all.indexOf(g) === i; }).slice(0, 3),
    seriesId: optionalInt(body.seriesId, 1, 999999999),
    seriesOrder: optionalInt(body.seriesOrder, 0, 100000)
  };
  const problems = [];
  if (!values.title || values.title.length > 120) {
    problems.push({ field: "title", message: "Give the work a title (up to 120 characters)." });
  }
  if (!CATEGORIES.includes(values.category)) {
    problems.push({ field: "category", message: "Choose a category." });
  }
  if (values.logline.length > 200) {
    problems.push({ field: "logline", message: "Keep the logline to one sentence (200 characters at most)." });
  }
  if (Number.isNaN(values.publishAt)) {
    problems.push({ field: "publishAt", message: "That publish date isn't valid." });
  }
  if (values.summary.length > 300) {
    problems.push({ field: "summary", message: "Keep the short description to 300 characters." });
  }
  if (values.body.length > 200000) {
    problems.push({ field: "body", message: "The text is too long (200,000 characters at most)." });
  }
  if (Number.isNaN(values.seriesId)) {
    problems.push({ field: "seriesId", message: "Choose a series from the list." });
  } else if (values.seriesId) {
    const found = await db.query("SELECT 1 FROM series WHERE id = $1 AND user_id = $2", [values.seriesId, req.session.user.id]);
    if (!found.rows.length) problems.push({ field: "seriesId", message: "That story no longer exists (or isn't yours)." });
  }
  if (values.category === "news" && !req.creator.canWriteNews) {
    problems.push({ field: "category", message: "News posts can only be posted by approved writers." });
  }
  if (values.category === "updates" && !req.isAdmin) {
    problems.push({ field: "category", message: "Choose another category." });
  }
  if (body.form) {
    if (!(await require("../flags").isOn("polls", req))) {
      problems.push({ field: "form", message: "Polls and questionnaires aren't switched on yet." });
    } else {
      const form = cleanForm(body.form);
      if (form.problem) problems.push({ field: "form", message: form.problem });
      else values.form = form.form;
    }
  }
  if (values.category === "poll" && !values.form) {
    problems.push({ field: "form", message: "Add the poll's question and options." });
  }
  if (Number.isNaN(values.seriesOrder)) {
    problems.push({ field: "seriesOrder", message: "Use a whole number for the chapter, e.g. 1, 2, 3." });
  }
  if (!values.seriesId) values.seriesOrder = null;
  return { values: values, problems: problems };
}

// The work's cover for cards: the first picture, or a still from the first video.
// A picture marked "cover" wins; otherwise the first picture, then a still from the first video.
function coverFor(items) {
  const chosen = items.find(function (m) { return m.role === "cover" && m.kind === "image"; });
  if (chosen) return chosen.url;
  const image = items.find(function (m) { return m.kind === "image"; });
  if (image) return image.url;
  const video = items.find(function (m) { return m.kind === "video"; });
  return video ? storage.posterUrl(video.url) : null;
}

async function savePost(req, res, existingRow) {
  const { values, problems } = await validatePost(req.body, req);
  const existingMedia = existingRow
    ? (await db.query("SELECT * FROM post_media WHERE post_id = $1", [existingRow.id])).rows
    : [];
  // How many files fit in one post depends on the account's plan (Premium allows more).
  const planRow = (await db.query("SELECT plan, plan_until, role FROM users WHERE id = $1", [req.session.user.id])).rows[0];
  const maxMedia = planRow && planRow.role === "admin" ? Math.max(MAX_MEDIA, plans.PLANS.premium.maxMediaPerPost) : plans.planOf(planRow).maxMediaPerPost;
  const media = resolveMedia(req.body.media, existingMedia, {
    roles: ["page", "cover"], kinds: ["image", "video", "audio", "document"], max: maxMedia
  });
  if (media.problem) {
    problems.push({ field: "media", message: media.problem });
  } else {
    // Only pictures can be covers, and only one of them.
    media.items.forEach(function (m) { if (m.kind !== "image") m.role = "page"; });
    let seenCover = false;
    media.items.forEach(function (m) {
      if (m.role === "cover") { if (seenCover) m.role = "page"; seenCover = true; }
    });
    const visual = media.items.some(function (m) { return m.kind === "image" || m.kind === "video"; });
    if (NEEDS_VISUAL.includes(values.category) && !visual) {
      problems.push({ field: "media", message: "This kind of post needs at least one picture or video." });
    }
  }
  if (problems.length) {
    return res.status(400).json({ error: "Please fix the highlighted fields.", problems: problems });
  }

  const slug = existingRow && values.title === existingRow.title
    ? existingRow.slug
    : await uniqueSlug("posts", values.title, existingRow && existingRow.id);
  const cover = coverFor(media.items);

  const client = await db.pool.connect();
  let postId;
  try {
    await client.query("BEGIN");
    // Review: the admin's own posts go straight out; everyone else's wait for approval.
    const reviewStatus = req.isAdmin || !values.published ? "approved" : "pending";
    const fields = [slug, values.category, values.title, values.summary, values.body, cover,
      values.published, values.tags, values.seriesId, values.seriesOrder,
      values.logline, values.section, values.font, values.publishAt,
      values.form ? JSON.stringify(values.form) : null, reviewStatus];
    if (existingRow) {
      postId = existingRow.id;
      await client.query(
        `UPDATE posts SET slug = $1, category = $2, title = $3, summary = $4, body = $5, image_url = $6,
                image_public_id = NULL, published = $7, tags = $8, series_id = $9, series_order = $10,
                logline = $11, section = $12, font = $13, publish_at = $14, form = $15::jsonb,
                review_status = $16::varchar, review_note = CASE WHEN $16::varchar = 'pending' THEN '' ELSE review_note END,
                submitted_at = CASE WHEN $16::varchar = 'pending' THEN NOW() ELSE submitted_at END, updated_at = NOW()
          WHERE id = $17`,
        fields.concat([postId])
      );
      const keep = media.items.filter(function (m) { return m.id; }).map(function (m) { return m.id; });
      await client.query("DELETE FROM post_media WHERE post_id = $1 AND NOT (id = ANY ($2::int[]))", [postId, keep]);
    } else {
      const inserted = await client.query(
        `INSERT INTO posts (slug, category, title, summary, body, image_url, published, tags, series_id, series_order,
                            logline, section, font, publish_at, form, review_status, submitted_at, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::varchar,
                 CASE WHEN $16::varchar = 'pending' THEN NOW() END, $17) RETURNING id`,
        fields.concat([req.session.user.id])
      );
      postId = inserted.rows[0].id;
    }
    await client.query("UPDATE posts SET genres = $1 WHERE id = $2", [values.genres, postId]);
    for (let i = 0; i < media.items.length; i++) {
      const m = media.items[i];
      if (m.id) {
        await client.query("UPDATE post_media SET position = $1, caption = $2, role = $3 WHERE id = $4", [i, m.caption, m.role, m.id]);
      } else {
        await client.query(
          "INSERT INTO post_media (post_id, position, kind, url, public_id, caption, role) VALUES ($1, $2, $3, $4, $5, $6, $7)",
          [postId, i, m.kind, m.url, m.publicId, m.caption, m.role]
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

  // Files taken off the work are deleted from storage once the save has gone through.
  // (Old single-image works kept their picture in image_public_id: clean that up too.)
  await deleteAll(media.removed);
  if (existingRow && existingRow.image_public_id &&
      !media.items.some(function (m) { return m.publicId === existingRow.image_public_id; })) {
    await storage.deleteImage(existingRow.image_public_id);
  }

  const { rows } = await db.query(SELECT_POST + " WHERE p.id = $1", [postId]);
  const saved = rows[0];
  if (saved.review_status === "pending") {
    // Let the admin know there's something to review.
    const admins = await db.query("SELECT id FROM users WHERE role = 'admin'");
    await require("../notify").notifyMany(admins.rows.map(function (a) { return a.id; }), {
      type: "review",
      title: "New post to review: " + saved.title,
      body: "By " + (saved.creator_name || "a creator") + ". Approve it or send feedback.",
      link: "/admin#reviews"
    });
  } else {
    require("../publishing").announceReady().catch(function () {});
  }
  res.status(existingRow ? 200 : 201).json({ post: toPost(saved, true) });
}

// POST /api/posts  (JSON: title, category, summary, body, published, tags, seriesId, seriesOrder, media[])
router.post("/", requireCreator, requireFlag("creating", { adminAlways: true }), function (req, res) {
  return savePost(req, res, null);
});

// PUT /api/posts/:id  (same fields)
router.put("/:id", requireCreator, requireFlag("creating", { adminAlways: true }), async function (req, res) {
  const existing = await db.query("SELECT * FROM posts WHERE id = $1 AND user_id = $2", [Number(req.params.id), req.session.user.id]);
  if (!existing.rows.length) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  return savePost(req, res, existing.rows[0]);
});

// DELETE /api/posts/:id  (the owner, or the admin when removing a reported work)
router.delete("/:id", requireCreator, async function (req, res) {
  const id = Number(req.params.id);
  const owned = await db.query("SELECT 1 FROM posts WHERE id = $1 AND (user_id = $2 OR $3)", [id, req.session.user.id, req.isAdmin]);
  if (!owned.rows.length) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  const media = await db.query("SELECT public_id, kind FROM post_media WHERE post_id = $1", [id]);
  const { rows } = await db.query("DELETE FROM posts WHERE id = $1 RETURNING image_public_id", [id]);
  if (!rows.length) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  for (const m of media.rows) await storage.deleteMedia(m.public_id, m.kind);
  await storage.deleteImage(rows[0].image_public_id);
  res.json({ ok: true });
});

/* ---------- Members: likes and favourites ---------- */

async function findPublishedPost(id) {
  const { rows } = await db.query("SELECT id, user_id FROM posts p WHERE p.id = $1 AND " + VISIBLE, [id]);
  return rows[0];
}

// One function handles like/unlike and save/unsave, because they work the same way.
function toggleRoute(table, column) {
  return async function (req, res) {
    const id = Number(req.params.id);
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

router.post("/:id/like", requireLogin, requireFlag("likes"), toggleRoute("likes", "liked"));
router.delete("/:id/like", requireLogin, requireFlag("likes"), toggleRoute("likes", "liked"));
router.post("/:id/favourite", requireLogin, requireFlag("likes"), toggleRoute("favourites", "favourited"));
router.delete("/:id/favourite", requireLogin, requireFlag("likes"), toggleRoute("favourites", "favourited"));

/* ---------- Comments ---------- */

const COMMENT_SELECT = `
  SELECT c.*, u.username, u.display_name, u.role, u.avatar_url,
         (u.show_online AND u.last_seen_at > NOW() - INTERVAL '5 minutes') AS online
    FROM comments c JOIN users u ON u.id = c.user_id`;

// postOwnerId: the creator of the work, who may delete comments on it.
function toComment(row, viewer, postOwnerId) {
  return {
    id: row.id,
    parentId: row.parent_id,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    author: {
      username: row.username,
      displayName: row.display_name,
      role: row.role,
      avatarUrl: storage.avatarUrl(row.avatar_url),
      online: Boolean(row.online)
    },
    canEdit: Boolean(viewer && viewer.id === row.user_id),
    canDelete: Boolean(viewer && (viewer.role === "admin" || viewer.id === row.user_id || viewer.id === postOwnerId))
  };
}

// GET /api/posts/:id/comments  -> top-level comments and replies, oldest first (replies carry parentId)
router.get("/:id/comments", async function (req, res) {
  const id = Number(req.params.id);
  const post = await findPublishedPost(id);
  if (!post) {
    return res.status(404).json({ error: "That work could not be found." });
  }
  // Visitors without an account see how many comments there are, not the conversation itself.
  if (!req.session.user) return res.json({ comments: [], locked: true });
  const { rows } = await db.query(COMMENT_SELECT + " WHERE c.post_id = $1 ORDER BY c.created_at ASC, c.id ASC LIMIT 1000", [id]);
  res.json({ comments: rows.map(function (row) { return toComment(row, req.session.user, post.user_id); }) });
});

// POST /api/posts/:id/comments  { body, parentId? }
router.post("/:id/comments", requireLogin, requireFlag("comments"), commentLimiter, async function (req, res) {
  const id = Number(req.params.id);
  const body = cleanText(req.body.body);
  if (!body || body.length > 1000) {
    return res.status(400).json({ error: "Comments must be between 1 and 1000 characters." });
  }
  const post = await findPublishedPost(id);
  if (!post) {
    return res.status(404).json({ error: "That work could not be found." });
  }

  // A reply to a reply is attached to the same top-level comment, so threads stay one level deep.
  let parentId = null;
  if (req.body.parentId !== undefined && req.body.parentId !== null) {
    const parent = await db.query(
      "SELECT id, parent_id FROM comments WHERE id = $1 AND post_id = $2",
      [Number(req.body.parentId) || 0, id]
    );
    if (!parent.rows.length) {
      return res.status(404).json({ error: "The comment you replied to was deleted." });
    }
    parentId = parent.rows[0].parent_id || parent.rows[0].id;
  }

  const { rows } = await db.query(
    `WITH c AS (INSERT INTO comments (post_id, user_id, body, parent_id) VALUES ($1, $2, $3, $4) RETURNING *)
     SELECT c.*, u.username, u.display_name, u.role, u.avatar_url, TRUE AS online FROM c JOIN users u ON u.id = c.user_id`,
    [id, req.session.user.id, body, parentId]
  );
  res.status(201).json({ comment: toComment(rows[0], req.session.user, post.user_id) });
});

/* ---------- Polls and questionnaires ---------- */

// Checks and tidies a poll / questionnaire from the editor.
// { kind: "poll"|"questionnaire", questions: [{ text, type: "single"|"multiple"|"text", options: [] }],
//   results: "after-vote"|"always"|"creator", closesAt }
function cleanForm(input) {
  if (!input || typeof input !== "object") return { problem: "The poll is not valid." };
  const kind = input.kind === "questionnaire" ? "questionnaire" : "poll";
  const list = Array.isArray(input.questions) ? input.questions : [];
  if (!list.length) return { problem: "Add at least one question." };
  if (list.length > (kind === "poll" ? 1 : 20)) return { problem: kind === "poll" ? "A poll has one question. Use a questionnaire for more." : "Up to 20 questions." };
  const questions = [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i] || {};
    const textValue = cleanText(q.text).slice(0, 200);
    const type = ["single", "multiple", "text"].includes(q.type) ? q.type : "single";
    if (!textValue) return { problem: "Question " + (i + 1) + " needs some text." };
    if (kind === "poll" && type === "text") return { problem: "Poll questions need options to choose from." };
    const question = { id: "q" + (i + 1), text: textValue, type: type };
    if (type !== "text") {
      const options = (Array.isArray(q.options) ? q.options : []).map(function (o) { return cleanText(o).slice(0, 80); }).filter(Boolean);
      if (options.length < 2 || options.length > 10) return { problem: "Question " + (i + 1) + " needs 2 to 10 options." };
      question.options = options;
    }
    questions.push(question);
  }
  const closes = input.closesAt ? new Date(input.closesAt) : null;
  if (closes && isNaN(closes.getTime())) return { problem: "That closing date isn't valid." };
  return {
    form: {
      kind: kind,
      questions: questions,
      results: ["after-vote", "always", "creator"].includes(input.results) ? input.results : "after-vote",
      closesAt: closes ? closes.toISOString() : null
    }
  };
}

async function formPost(id) {
  const { rows } = await db.query("SELECT p.id, p.user_id, p.form, p.title FROM posts p WHERE p.id = $1 AND p.form IS NOT NULL AND " + VISIBLE, [id]);
  return rows[0] || null;
}

// POST /api/posts/:id/responses { answers: { q1: 0, q2: [0, 2], q3: "text" } }
router.post("/:id/responses", requireLogin, commentLimiter, async function (req, res) {
  const post = await formPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: "That poll could not be found." });
  const form = post.form;
  if (form.closesAt && new Date(form.closesAt) < new Date()) return res.status(400).json({ error: "This poll has closed." });
  const input = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
  const answers = {};
  for (const q of form.questions) {
    const a = input[q.id];
    if (q.type === "single") {
      if (!Number.isInteger(a) || a < 0 || a >= q.options.length) return res.status(400).json({ error: "Answer: " + q.text });
      answers[q.id] = a;
    } else if (q.type === "multiple") {
      const picks = Array.isArray(a) ? Array.from(new Set(a.filter(function (x) { return Number.isInteger(x) && x >= 0 && x < q.options.length; }))) : [];
      if (!picks.length) return res.status(400).json({ error: "Choose at least one option: " + q.text });
      answers[q.id] = picks;
    } else {
      const t = cleanText(a).slice(0, 1000);
      if (!t) return res.status(400).json({ error: "Answer: " + q.text });
      answers[q.id] = t;
    }
  }
  await db.query(
    `INSERT INTO form_responses (post_id, user_id, answers) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET answers = EXCLUDED.answers, created_at = NOW()`,
    [post.id, req.session.user.id, JSON.stringify(answers)]
  );
  res.status(201).json({ ok: true, answers: answers });
});

// GET /api/posts/:id/results -> counts per option; written answers only for the creator
router.get("/:id/results", async function (req, res) {
  const post = await formPost(Number(req.params.id));
  if (!post) return res.status(404).json({ error: "That poll could not be found." });
  const viewer = req.session.user;
  const isOwner = Boolean(viewer && (viewer.id === post.user_id || viewer.role === "admin"));
  let voted = false;
  if (viewer) {
    const r = await db.query("SELECT 1 FROM form_responses WHERE post_id = $1 AND user_id = $2", [post.id, viewer.id]);
    voted = r.rows.length > 0;
  }
  const closed = post.form.closesAt && new Date(post.form.closesAt) < new Date();
  const mode = post.form.results;
  const canSee = isOwner || mode === "always" || (mode === "after-vote" && (voted || closed));
  const total = await db.query("SELECT COUNT(*)::int AS n FROM form_responses WHERE post_id = $1", [post.id]);
  if (!canSee) return res.json({ visible: false, total: total.rows[0].n, voted: voted, closed: Boolean(closed) });

  const { rows } = await db.query(
    `SELECT r.answers, r.created_at, u.username, u.display_name FROM form_responses r JOIN users u ON u.id = r.user_id
      WHERE r.post_id = $1 ORDER BY r.created_at DESC LIMIT 5000`,
    [post.id]
  );
  const questions = post.form.questions.map(function (q) {
    const out = { id: q.id, text: q.text, type: q.type };
    if (q.type === "text") {
      out.answers = isOwner ? rows.filter(function (r) { return r.answers[q.id]; }).map(function (r) {
        return { text: r.answers[q.id], username: r.username, displayName: r.display_name, at: r.created_at };
      }) : undefined;
      out.count = rows.filter(function (r) { return r.answers[q.id]; }).length;
    } else {
      const counts = q.options.map(function () { return 0; });
      rows.forEach(function (r) {
        const a = r.answers[q.id];
        (Array.isArray(a) ? a : [a]).forEach(function (i) { if (Number.isInteger(i) && i < counts.length) counts[i]++; });
      });
      out.options = q.options.map(function (label, i) { return { label: label, count: counts[i] }; });
    }
    return out;
  });
  res.json({ visible: true, total: rows.length, voted: voted, closed: Boolean(closed), isOwner: isOwner, questions: questions });
});

module.exports = router;
module.exports.GENRES = GENRES;
module.exports.SHELVES = SHELVES;
module.exports.cleanForm = cleanForm;
module.exports.toComment = toComment;
module.exports.COMMENT_SELECT = COMMENT_SELECT;
module.exports.uniqueSlug = uniqueSlug;
module.exports.VISIBLE = VISIBLE;
module.exports.BANDITOS_ONLY = BANDITOS_ONLY;
module.exports.toPost = toPost;
module.exports.SELECT_POST = SELECT_POST;
