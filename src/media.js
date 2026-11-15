// src/media.js
// Shared by works and characters: turns the list of files the admin editor sends into
// files we trust, and works out a publish time.

const storage = require("./storage");

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Works out the final list of files from what the editor sent. Each entry is one of:
//   { id, caption, role }              keep a file that's already attached
//   { upload: {...}, caption, role }   a new file sent straight to Cloudinary (its receipt is checked)
//   { local: {...}, caption, role }    a new file saved on this laptop (test mode)
// options: { roles: ["page", "cover"], kinds: ["image", "video", "audio"], max: 80 }
function resolveMedia(input, existing, options) {
  if (!Array.isArray(input)) return { items: [], removed: existing.slice(), problem: null };
  if (input.length > options.max) return { problem: "Up to " + options.max + " files can be attached." };
  const byId = new Map(existing.map(function (m) { return [m.id, m]; }));
  const items = [];

  for (const raw of input) {
    if (!raw || typeof raw !== "object") return { problem: "One of the files is not valid." };
    const caption = cleanText(raw.caption).slice(0, 200);
    const role = options.roles.includes(raw.role) ? raw.role : options.roles[0];
    let file;
    if (raw.id !== undefined) {
      const old = byId.get(Number(raw.id));
      if (!old) return { problem: "One of the files no longer belongs here. Reload the page." };
      byId.delete(old.id);
      file = { id: old.id, kind: old.kind || "image", url: old.url, publicId: old.public_id };
    } else if (raw.upload) {
      file = storage.verifyCloudinaryUpload(raw.upload);
      if (!file) return { problem: "Cloudinary's receipt for one of the files didn't check out. Upload it again." };
    } else if (raw.local && storage.localFileExists(raw.local.publicId, raw.local.url)) {
      const kind = ["image", "video", "audio", "document"].includes(raw.local.kind) ? raw.local.kind : null;
      if (!kind) return { problem: "One of the files is not valid." };
      file = { kind: kind, url: raw.local.url, publicId: raw.local.publicId };
    } else {
      return { problem: "One of the files is missing. Upload it again." };
    }
    if (!options.kinds.includes(file.kind)) {
      return { problem: "Only pictures can be used here." };
    }
    items.push(Object.assign(file, { caption: caption, role: role }));
  }
  return { items: items, removed: Array.from(byId.values()), problem: null };
}

// "" -> null (publish straight away); an ISO date -> Date; anything else -> NaN (a problem).
function parsePublishAt(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return NaN;
  return date;
}

// "draft", "scheduled" or "live"
function statusOf(row) {
  if (!row.published) return "draft";
  if (row.publish_at && new Date(row.publish_at) > new Date()) return "scheduled";
  return "live";
}

async function deleteAll(files) {
  for (const m of files || []) await storage.deleteMedia(m.public_id, m.kind || "image");
}

module.exports = { resolveMedia, parsePublishAt, statusOf, deleteAll, cleanText };
