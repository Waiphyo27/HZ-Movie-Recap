const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const LOGO_DIR = process.env.LOGO_DIR || "./logos";

if (!fs.existsSync(LOGO_DIR)) {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}

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
    return cb(new Error(`Unsupported image type: ${file.mimetype}. Use PNG, JPEG, or WEBP.`));
  }
  cb(null, true);
}

const logoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB — logos should be small
});

module.exports = { logoUpload };
