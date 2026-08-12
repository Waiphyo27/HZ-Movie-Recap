const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const LOGO_DIR = process.env.LOGO_DIR || "./uploads/logos";
if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, LOGO_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${uuidv4()}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error(`Unsupported image type: ${file.mimetype}. Use PNG, JPEG, or WebP.`));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB is plenty for a logo
});

/**
 * POST /api/logo/upload
 * multipart/form-data with a single "logo" image field.
 * Returns a logoPath that can be passed straight into POST /api/render.
 */
router.post("/upload", upload.single("logo"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No logo image received." });
  }
  res.status(201).json({ logoPath: req.file.path });
});

module.exports = router;
