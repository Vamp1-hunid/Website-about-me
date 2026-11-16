// src/storage.js
// Saves uploaded pictures, video clips and audio files.
// - On Render: in Cloudinary (Render's free disk is wiped on every deploy and restart).
//   Big files (video, audio, many manga pages) go STRAIGHT from the browser to Cloudinary,
//   so they never squeeze through Render's small free server. The server only signs the
//   upload beforehand and checks Cloudinary's receipt afterwards.
// - On your laptop without Cloudinary set up: in public/uploads/ so you can still test.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const useCloudinary = Boolean(process.env.CLOUDINARY_URL);
const localDir = path.join(__dirname, "..", "public", "uploads");
const FOLDER = "mwamba-site";

if (useCloudinary) {
  // The cloudinary package reads CLOUDINARY_URL from the environment by itself.
  cloudinary.config({ secure: true });
} else if (process.env.NODE_ENV === "production") {
  console.warn("CLOUDINARY_URL is not set: uploaded files will be lost when Render restarts.");
}

/* ---------- What may be uploaded ---------- */

const IMAGE_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
const VIDEO_TYPES = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
const AUDIO_TYPES = {
  "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
  "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/ogg": ".ogg"
};

// Documents readers can download (PDF, Word, e-books ...), kept as "raw" files on Cloudinary.
const DOCUMENT_EXTENSIONS = ["pdf", "docx", "doc", "odt", "txt", "md", "epub", "pptx"];

const FORMATS = {
  image: ["jpg", "jpeg", "png", "webp", "gif"],
  video: ["mp4", "webm", "mov"],
  audio: ["mp3", "m4a", "wav", "ogg"],
  document: DOCUMENT_EXTENSIONS
};

// Size limits, in megabytes. Cloudinary's free plan allows 10 MB pictures and files, 100 MB videos.
const LIMITS_MB = { image: 10, video: 100, audio: 50, document: 10 };

function extensionOf(name) {
  const match = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  return match ? match[1] : "";
}

function kindFromMime(mimetype, filename) {
  if (IMAGE_TYPES[mimetype]) return "image";
  if (VIDEO_TYPES[mimetype]) return "video";
  if (AUDIO_TYPES[mimetype]) return "audio";
  if (DOCUMENT_EXTENSIONS.includes(extensionOf(filename))) return "document";
  return null;
}

function kindFromFormat(format) {
  const f = String(format || "").toLowerCase();
  return Object.keys(FORMATS).find(function (kind) { return FORMATS[kind].includes(f); }) || null;
}

/* ---------- Multer: files that DO pass through this server ---------- */

// Profile pictures and single images (max 8 MB, pictures only).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, done) {
    if (IMAGE_TYPES[file.mimetype]) done(null, true);
    else done(new Error("Only JPG, PNG, WebP or GIF images can be uploaded."));
  }
});

// Works' media when testing on a laptop without Cloudinary (one file per request).
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS_MB.video * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, done) {
    if (kindFromMime(file.mimetype, file.originalname)) done(null, true);
    else done(new Error("That file type isn't supported. Use pictures (JPG, PNG, WebP, GIF), video (MP4, WebM, MOV), audio (MP3, M4A, WAV, OGG) or documents (PDF, DOCX, DOC, ODT, TXT, MD, EPUB, PPTX)."));
  }
});

// Writing files to import into the text box: Word (.docx), plain text (.txt) or Markdown (.md).
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, done) {
    if (/\.(docx|txt|md|markdown)$/i.test(file.originalname || "")) done(null, true);
    else done(new Error("Choose a .docx, .txt or .md file."));
  }
});

/* ---------- Checking that a file really is what it claims ---------- */

function sniffKind(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const hex = buffer.subarray(0, 12).toString("hex");
  const ascii = buffer.subarray(0, 12).toString("latin1");
  if (hex.startsWith("ffd8ff") || hex.startsWith("89504e470d0a1a0a") || hex.startsWith("47494638")) return "image";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "audio";
  if (ascii.slice(4, 8) === "ftyp") return "video-or-audio";   // MP4, MOV, M4A
  if (hex.startsWith("1a45dfa3")) return "video";               // WebM
  if (ascii.startsWith("OggS")) return "audio";
  // MP3 / AAC: an ID3 tag, or an MPEG audio frame (its first 11 bits are all 1s).
  if (ascii.startsWith("ID3") || /^ff[ef]/.test(hex)) return "audio";
  return null;
}

function looksLikeDocument(buffer, extension) {
  if (!buffer || !buffer.length) return false;
  const head = buffer.subarray(0, 8);
  if (extension === "pdf") return head.toString("latin1").startsWith("%PDF");
  if (["docx", "odt", "epub", "pptx"].includes(extension)) return head.toString("hex").startsWith("504b0304");
  if (extension === "doc") return head.toString("hex").startsWith("d0cf11e0");
  // .txt / .md: plain text, no binary zero bytes
  return !buffer.subarray(0, 4096).includes(0);
}

function looksLike(buffer, kind) {
  const sniffed = sniffKind(buffer);
  if (sniffed === kind) return true;
  return sniffed === "video-or-audio" && (kind === "video" || kind === "audio");
}

/* ---------- Saving ---------- */

// Files up to this size also get a backup copy in the database, so they survive Render wiping its disk.
const DB_BACKUP_MAX = 8 * 1024 * 1024;
const MIME_BY_EXT = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".txt": "text/plain", ".md": "text/plain" };

function saveLocal(buffer, extension) {
  fs.mkdirSync(localDir, { recursive: true });
  const name = crypto.randomBytes(12).toString("hex") + extension;
  fs.writeFileSync(path.join(localDir, name), buffer);
  if (buffer.length <= DB_BACKUP_MAX) {
    require("./db").query("INSERT INTO stored_files (name, mime, data) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
      [name, MIME_BY_EXT[extension] || "application/octet-stream", buffer]).catch(function (e) { console.warn("Could not back up upload:", e.message); });
  }
  return { url: "/uploads/" + name, publicId: "local:" + name };
}

// GET /uploads/<name> when the file isn't on disk (Render wiped it): serve the database copy and put it back on disk.
async function serveBackup(req, res, next) {
  const name = path.basename(req.params.name || "");
  if (!/^[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(name)) return next();
  try {
    const { rows } = await require("./db").query("SELECT mime, data FROM stored_files WHERE name = $1", [name]);
    if (!rows.length) return next();
    try { fs.mkdirSync(localDir, { recursive: true }); fs.writeFileSync(path.join(localDir, name), rows[0].data); } catch (e) { /* disk is optional */ }
    res.setHeader("Content-Type", rows[0].mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(rows[0].data);
  } catch (e) { next(e); }
}

function uploadToCloudinary(buffer, options) {
  return new Promise(function (resolve, reject) {
    const stream = cloudinary.uploader.upload_stream(Object.assign({ folder: FOLDER }, options), function (error, result) {
      if (error) return reject(new Error(cloudinaryMessage(error)));
      resolve(result);
    });
    stream.end(buffer);
  });
}

// Turns Cloudinary's technical errors into something you can act on.
function cloudinaryMessage(error) {
  const text = String((error && error.message) || error || "");
  if (/api_key|api key|Invalid Signature|cloud_name|Unknown API key/i.test(text)) {
    return "Cloudinary refused the upload: the CLOUDINARY_URL on Render looks wrong. Copy it again from the Cloudinary dashboard.";
  }
  if (/File size too large/i.test(text)) return "That file is too big for Cloudinary's free plan.";
  return "Cloudinary could not save the file (" + text.slice(0, 160) + ").";
}

// Saves one picture (used for profile pictures). Returns { url, publicId }.
async function saveImage(file) {
  if (!looksLike(file.buffer, "image")) {
    throw new Error("That file is not a valid image.");
  }
  if (useCloudinary) {
    const result = await uploadToCloudinary(file.buffer, { resource_type: "image" });
    return { url: result.secure_url, publicId: result.public_id };
  }
  return saveLocal(file.buffer, IMAGE_TYPES[file.mimetype]);
}

// Laptop mode: saves one media file sent to the server. Returns { kind, url, publicId }.
async function saveMediaFile(file) {
  const kind = kindFromMime(file.mimetype, file.originalname);
  if (kind === "document") {
    const extension = extensionOf(file.originalname);
    if (!looksLikeDocument(file.buffer, extension)) throw new Error("That file doesn't look like a real ." + extension + " file.");
    if (file.size > LIMITS_MB.document * 1024 * 1024) throw new Error("Documents must be " + LIMITS_MB.document + " MB or smaller.");
    return Object.assign({ kind: kind }, saveLocal(file.buffer, "." + extension));
  }
  if (!kind || !looksLike(file.buffer, kind)) {
    throw new Error("That file doesn't look like a real picture, video or audio file.");
  }
  if (file.size > LIMITS_MB[kind] * 1024 * 1024) {
    throw new Error("That " + kind + " is bigger than " + LIMITS_MB[kind] + " MB.");
  }
  const types = Object.assign({}, IMAGE_TYPES, VIDEO_TYPES, AUDIO_TYPES);
  return Object.assign({ kind: kind }, saveLocal(file.buffer, types[file.mimetype]));
}

/* ---------- Direct browser -> Cloudinary uploads ---------- */

// The signed "permission slip" the browser needs to upload one file straight to Cloudinary.
// Everything signed here (folder, allowed formats, time) can't be changed by the browser.
// kind "document" uploads as a raw file (downloaded as it is); anything else as a picture/video/audio.
function signUpload(kind) {
  const config = cloudinary.config();
  const isDocument = kind === "document";
  const params = { timestamp: Math.floor(Date.now() / 1000), folder: FOLDER };
  if (!isDocument) params.allowed_formats = [].concat(FORMATS.image, FORMATS.video, FORMATS.audio).join(",");
  return {
    mode: "cloudinary",
    uploadUrl: "https://api.cloudinary.com/v1_1/" + config.cloud_name + "/" + (isDocument ? "raw" : "auto") + "/upload",
    fields: Object.assign({}, params, {
      api_key: config.api_key,
      signature: cloudinary.utils.api_sign_request(params, config.api_secret)
    }),
    limitsMb: LIMITS_MB
  };
}

// Checks Cloudinary's receipt for a direct upload and builds the file's address ourselves,
// so nobody can sneak in a link to a file that isn't really ours.
function verifyCloudinaryUpload(receipt) {
  if (!useCloudinary || !receipt) return null;
  const publicId = String(receipt.publicId || "");
  const version = String(receipt.version || "");
  const format = String(receipt.format || "").toLowerCase();
  const resourceType = String(receipt.resourceType || "");

  if (!publicId.startsWith(FOLDER + "/") || !/^[\w/.-]+$/.test(publicId) || publicId.includes("..")) return null;
  if (!/^\d+$/.test(version)) return null;
  if (!cloudinary.utils.verify_api_response_signature(publicId, version, String(receipt.signature || ""))) return null;
  const cloud = cloudinary.config().cloud_name;

  if (resourceType === "raw") {
    // Raw files keep their extension in the public id, e.g. mwamba-site/abc123.pdf
    if (!DOCUMENT_EXTENSIONS.includes(extensionOf(publicId))) return null;
    return { kind: "document", url: "https://res.cloudinary.com/" + cloud + "/raw/upload/v" + version + "/" + publicId, publicId: publicId };
  }
  if (!/^[a-z0-9]+$/.test(format) || publicId.includes(".")) return null;
  if (resourceType !== "image" && resourceType !== "video") return null;

  const kind = kindFromFormat(format);
  if (!kind || kind === "document" || (kind === "image") !== (resourceType === "image")) return null;

  return {
    kind: kind,
    url: "https://res.cloudinary.com/" + cloud + "/" + resourceType + "/upload/v" + version + "/" + publicId + "." + format,
    publicId: publicId
  };
}

/* ---------- Deleting ---------- */

// Deletes a file that is no longer used. Failures are only logged.
async function deleteMedia(publicId, kind) {
  if (!publicId) return;
  try {
    if (publicId.startsWith("local:")) {
      const name = path.basename(publicId.slice(6));
      fs.rmSync(path.join(localDir, name), { force: true });
      await require("./db").query("DELETE FROM stored_files WHERE name = $1", [name]);
    } else if (useCloudinary) {
      const type = kind === "document" ? "raw" : kind === "video" || kind === "audio" ? "video" : "image";
      await cloudinary.uploader.destroy(publicId, { resource_type: type });
    }
  } catch (error) {
    console.warn("Could not delete old file:", error.message);
  }
}

function deleteImage(publicId) {
  return deleteMedia(publicId, "image");
}

// Is this a file we saved earlier in laptop mode?
function localFileExists(publicId, url) {
  if (typeof publicId !== "string" || !publicId.startsWith("local:")) return false;
  const name = publicId.slice(6);
  if (!/^[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(name) || url !== "/uploads/" + name) return false;
  return fs.existsSync(path.join(localDir, name));
}

// Same, but also counts the database backup (for files Render's disk lost).
async function localFileKnown(publicId, url) {
  if (localFileExists(publicId, url)) return true;
  if (typeof publicId !== "string" || !publicId.startsWith("local:")) return false;
  const name = publicId.slice(6);
  if (!/^[a-f0-9]{24}\.[a-z0-9]{2,5}$/.test(name) || url !== "/uploads/" + name) return false;
  const { rows } = await require("./db").query("SELECT 1 FROM stored_files WHERE name = $1", [name]);
  return rows.length > 0;
}

/* ---------- Resized copies (Cloudinary does this on the fly) ---------- */

function transform(url, steps) {
  if (url && url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/" + steps + "/");
  }
  return url;
}

// A smaller copy for gallery thumbnails.
function thumbnailUrl(url) {
  return transform(url, "c_limit,w_720,q_auto,f_auto");
}

// A full-size copy, compressed for the web (manga pages load much faster).
function displayUrl(url, kind) {
  if (kind === "image" && url && !/\.gif$/i.test(url)) return transform(url, "q_auto,f_auto");
  return url;
}

// A still picture from the first second of a Cloudinary video, used as its cover.
function posterUrl(url) {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return null;
  return url.replace("/video/upload/", "/video/upload/so_1/").replace(/\.[a-z0-9]+$/i, ".jpg");
}

// A square, face-centred copy for profile pictures.
function avatarUrl(url) {
  return transform(url, "c_fill,g_face,w_160,h_160,q_auto,f_auto");
}

module.exports = {
  serveBackup, localFileKnown,
  useCloudinary, upload, extensionOf, mediaUpload, documentUpload, LIMITS_MB, FORMATS,
  saveImage, saveMediaFile, signUpload, verifyCloudinaryUpload, localFileExists,
  deleteImage, deleteMedia, thumbnailUrl, displayUrl, posterUrl, avatarUrl, cloudinaryMessage
};
