require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const videoRoutes = require("./routes/video");
const transcribeRoutes = require("./routes/transcribe");
const scriptRoutes = require("./routes/script");
const translateRoutes = require("./routes/translate");
const ttsRoutes = require("./routes/tts");
const renderRoutes = require("./routes/render");
const logoRoutes = require("./routes/logo");
const authRoutes = require("./routes/auth");

const { requireAuth } = require("./middleware/requireAuth");
const { allowedEmails } = require("./services/authStore");

const app = express();
const PORT = process.env.PORT || 4000;

// We sit behind Caddy, so trust its X-Forwarded-* headers (needed for Secure cookies).
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------
// Public routes — reachable without signing in
// ---------------------------------------------------------------
app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

// ---------------------------------------------------------------
// Everything past this line requires a valid session
// ---------------------------------------------------------------
app.use(requireAuth);

app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/files/renders", express.static(path.join(__dirname, "..", "renders")));
app.use("/files/thumbnails", express.static(path.join(__dirname, "..", "thumbnails")));

app.use("/api/video", videoRoutes);
app.use("/api/transcribe", transcribeRoutes);
app.use("/api/script", scriptRoutes);
app.use("/api/translate", translateRoutes);
app.use("/api/tts", ttsRoutes);
app.use("/api/render", renderRoutes);
app.use("/api/logo", logoRoutes);

app.listen(PORT, () => {
  console.log(`Video input module running on http://localhost:${PORT}`);
  const list = allowedEmails();
  if (list.length === 0) {
    console.warn(
      "[auth] WARNING: AUTH_ALLOWED_EMAILS is empty — nobody can sign in. " +
        "Add it to .env, e.g. AUTH_ALLOWED_EMAILS=you@gmail.com,friend@gmail.com"
    );
  } else {
    console.log(`[auth] ${list.length} email(s) allowed to sign in.`);
  }
});
