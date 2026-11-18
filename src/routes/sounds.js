// src/routes/sounds.js
// Music and sounds people can put on posts and statuses.
//   GET    /api/sounds?tab=library|mine&q=   the free library, or my own uploads (logged in)
//   POST   /api/sounds                       add a sound: a creator's own audio (they confirm the rights), or, for the
//                                            owner / admins with library: true, a royalty-free track for everyone
//   DELETE /api/sounds/:id                   remove my sound (admins can remove library tracks too)
//
// Chapterhive has no deals with record labels, so chart music can't be offered (Instagram and WhatsApp pay for theirs).
// Library tracks are original or royalty-free, with where each came from kept in license_note.

const express = require("express");
const db = require("../db");
const storage = require("../storage");
const { requireLogin, requireCreator } = require("../auth");
const { resolveMedia, cleanText } = require("../media");

const router = express.Router();
router.use(requireLogin);

function soundOut(row, userId, isAdmin) {
  return {
    id: row.id, title: row.title, artist: row.artist, url: storage.displayUrl(row.url, "audio"),
    duration: row.duration, library: row.user_id === null, licenseNote: row.license_note || "",
    mine: row.user_id === userId, canRemove: row.user_id === userId || (row.user_id === null && isAdmin), uses: row.uses
  };
}

router.get("/", async function (req, res) {
  const userId = req.session.user.id;
  const tab = req.query.tab === "mine" ? "mine" : "library";
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 40) : "";
  const values = [q];
  let where = "NOT s.removed AND ($1 = '' OR ch_match(s.title, $1) OR ch_match(s.artist, $1))";
  if (tab === "mine") { values.push(userId); where += " AND s.user_id = $2"; } else where += " AND s.user_id IS NULL";
  const { rows } = await db.query(`SELECT s.* FROM sounds s WHERE ${where} ORDER BY s.uses DESC, s.created_at DESC LIMIT 60`, values);
  res.json({ sounds: rows.map(function (r) { return soundOut(r, userId, req.session.user.role === "admin"); }) });
});

router.post("/", requireCreator, async function (req, res) {
  const title = cleanText(req.body.title).slice(0, 80);
  const artist = cleanText(req.body.artist).slice(0, 80);
  const library = req.body.library === true && req.isAdmin;
  const licenseNote = cleanText(req.body.licenseNote).slice(0, 300);
  const duration = Number(req.body.duration);
  if (!title) return res.status(400).json({ error: "Give the sound a name." });
  if (!library && req.body.rightsConfirmed !== true) {
    return res.status(400).json({ error: "Tick the box to confirm you made this audio or have the rights to use it." });
  }
  if (library && !licenseNote) {
    return res.status(400).json({ error: "Say where this track came from and its licence (for example a Pixabay Music link)." });
  }
  const media = resolveMedia([req.body.file], [], { roles: ["page"], kinds: ["audio"], max: 1 });
  if (media.problem || !media.items.length) return res.status(400).json({ error: media.problem ? media.problem.replace("Only pictures", "Only audio files (MP3, M4A, WAV, OGG)") : "Choose an audio file." });
  const f = media.items[0];
  const { rows } = await db.query(
    `INSERT INTO sounds (user_id, title, artist, url, public_id, duration, license_note, rights_confirmed)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING *`,
    [library ? null : req.session.user.id, title, artist, f.url, f.publicId || null,
      Number.isFinite(duration) && duration > 0 ? Math.min(duration, 3600) : null, licenseNote]);
  res.status(201).json({ sound: soundOut(rows[0], req.session.user.id, req.isAdmin) });
});

router.delete("/:id", async function (req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(404).json({ error: "Not found." });
  const isAdmin = req.session.user.role === "admin";
  const { rows } = await db.query(
    "UPDATE sounds SET removed = TRUE WHERE id = $1 AND (user_id = $2 OR ($3 AND user_id IS NULL)) RETURNING id",
    [id, req.session.user.id, isAdmin]);
  if (!rows.length) return res.status(404).json({ error: "That sound could not be found." });
  res.json({ ok: true });
});

// Can this person put this sound on something? (library tracks: anyone; uploads: only the uploader, or an admin)
async function usableSound(soundId, userId, isAdmin) {
  if (soundId === null || soundId === undefined || soundId === "") return null;
  const id = Number(soundId);
  if (!Number.isInteger(id)) return NaN;
  const { rows } = await db.query("SELECT id, user_id FROM sounds WHERE id = $1 AND NOT removed", [id]);
  if (!rows.length) return NaN;
  if (rows[0].user_id !== null && rows[0].user_id !== userId && !isAdmin) return NaN;
  return id;
}

// For SELECTs: the sound on a row (p.sound_id), as JSON.
const SOUND_JSON = (alias) => `(SELECT json_build_object('id', so.id, 'title', so.title, 'artist', so.artist, 'url', so.url,
  'duration', so.duration) FROM sounds so WHERE so.id = ${alias}.sound_id AND NOT so.removed)`;

function soundForClient(json, start) {
  if (!json) return null;
  return { id: json.id, title: json.title, artist: json.artist, url: storage.displayUrl(json.url, "audio"),
    duration: json.duration, start: Number(start) || 0 };
}

module.exports = router;
module.exports.usableSound = usableSound;
module.exports.SOUND_JSON = SOUND_JSON;
module.exports.soundForClient = soundForClient;
