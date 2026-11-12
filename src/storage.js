// src/storage.js
// Saves uploaded images.
// - On Render: to Cloudinary (Render's free disk is wiped on every deploy and restart).
// - On your laptop without Cloudinary set up: to public/uploads/ so you can still test.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

const useCloudinary = Boolean(process.env.CLOUDINARY_URL);
const localDir = path.join(__dirname, "..", "public", "uploads");

if (useCloudinary) {
  // The cloudinary package reads CLOUDINARY_URL from the environment by itself.
  cloudinary.config({ secure: true });
} else if (process.env.NODE_ENV === "production") {
  console.warn("CLOUDINARY_URL is not set: uploaded images will be lost when Render restarts.");
}

const ALLOWED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif"
};

// Keep the file in memory (max 8 MB) and reject anything that is not an image.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: function (req, file, done) {
    if (ALLOWED_TYPES[file.mimetype]) {
      done(null, true);
    } else {
      done(new Error("Only JPG, PNG, WebP or GIF images can be uploaded."));
    }
  }
});

// Checks the first bytes of the file, so a renamed non-image is rejected too.
function looksLikeImage(buffer) {
  if (!buffer || buffer.length < 12) return false;
  const hex = buffer.subarray(0, 12).toString("hex");
  return (
    hex.startsWith("ffd8ff") ||                 // JPEG
    hex.startsWith("89504e470d0a1a0a") ||       // PNG
    hex.startsWith("47494638") ||               // GIF
    (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") // WebP (RIFF....WEBP)
  );
}

// Saves the image and returns { url, publicId }.
async function saveImage(file) {
  if (!looksLikeImage(file.buffer)) {
    throw new Error("That file is not a valid image.");
  }

  if (useCloudinary) {
    return new Promise(function (resolve, reject) {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "mwamba-site", resource_type: "image" },
        function (error, result) {
          if (error) return reject(error);
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      );
      stream.end(file.buffer);
    });
  }

  fs.mkdirSync(localDir, { recursive: true });
  const name = crypto.randomBytes(12).toString("hex") + ALLOWED_TYPES[file.mimetype];
  fs.writeFileSync(path.join(localDir, name), file.buffer);
  return { url: "/uploads/" + name, publicId: "local:" + name };
}

// Deletes an image that is no longer used. Failures are only logged.
async function deleteImage(publicId) {
  if (!publicId) return;
  try {
    if (publicId.startsWith("local:")) {
      const name = path.basename(publicId.slice(6));
      fs.rmSync(path.join(localDir, name), { force: true });
    } else if (useCloudinary) {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (error) {
    console.warn("Could not delete old image:", error.message);
  }
}

// Cloudinary can resize on the fly: this asks for a smaller copy for gallery thumbnails.
function thumbnailUrl(url) {
  if (url && url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/c_limit,w_720,q_auto,f_auto/");
  }
  return url;
}

module.exports = { upload, saveImage, deleteImage, thumbnailUrl, useCloudinary };
