const express = require("express");
const router = express.Router();

const { renderVideo } = require("../services/videoRenderer");
const { createJob, updateJob, getJob } = require("../services/jobStore");

router.post("/", async (req, res) => {
  const {
    videoJobId,
    ttsJobId,
    subtitlePosition,
    subtitlesEnabled,
    watermarkText,
    logoPath,
    logoPosition,
    aspectRatio,
    blurRegion,
    blurBox,
  } = req.body || {};

  if (!videoJobId || !ttsJobId) {
    return res.status(400).json({ error: "Both videoJobId and ttsJobId are required." });
  }

  const videoJob = getJob(videoJobId);
  if (!videoJob || videoJob.status !== "done" || !videoJob.filePath) {
    return res.status(400).json({ error: "videoJobId is not a completed video job." });
  }

  const ttsJob = getJob(ttsJobId);
  if (!ttsJob || ttsJob.status !== "done" || !ttsJob.audioPath) {
    return res.status(400).json({ error: "ttsJobId is not a completed TTS job." });
  }

  const textSourceJob = getJob(ttsJob.source);
  const narrationText = textSourceJob
    ? textSourceJob.translatedText || textSourceJob.scriptText
    : null;

  if (!narrationText) {
    return res.status(400).json({ error: "Could not find narration text for subtitles." });
  }

  const renderJob = createJob({ type: "render", source: ttsJobId });
  updateJob(renderJob.id, { status: "processing", progress: 10 });

  res.status(202).json({ jobId: renderJob.id, status: "processing" });

  try {
    const result = await renderVideo({
      videoPath: videoJob.filePath,
      audioPath: ttsJob.audioPath,
      narrationText,
      jobId: renderJob.id,
      subtitlePosition,
      subtitlesEnabled: subtitlesEnabled !== false,
      watermarkText: watermarkText || null,
      logoPath: logoPath || null,
      logoPosition: logoPosition || null,
      aspectRatio: aspectRatio || "original",
      blurRegion: blurRegion || "none",
      blurBox: blurBox || null,
    });

    updateJob(renderJob.id, {
      status: "done",
      progress: 100,
      outputPath: result.outputPath,
      srtPath: result.srtPath,
    });
  } catch (err) {
    console.error("Video render failed:", err);
    updateJob(renderJob.id, {
      status: "error",
      error: err && err.message ? err.message : "Unknown render error",
    });
  }
});

router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

module.exports = router;