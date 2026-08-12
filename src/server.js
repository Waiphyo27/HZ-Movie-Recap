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

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

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

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Video input module running on http://localhost:${PORT}`);
});