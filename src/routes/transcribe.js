const express = require("express");
const router = express.Router();

const { extractAudio } = require("../services/audioExtractor");
const { transcribeAudio } = require("../services/transcriber");
const { createJob, updateJob, getJob } = require("../services/jobStore");

/**
 * POST /api/transcribe/:videoJobId
 * body (optional): { "language": "en" }  — omit to let Whisper auto-detect
 *
 * Takes a completed video-download/upload job (status must be "done") and
 * runs it through: extract audio -> Whisper transcription -> save .srt/.txt.
 *
 * Returns a NEW job id immediately (this step calls an external API and
 * can take anywhere from a few seconds to a minute depending on video
 * length, so we don't make the frontend wait on an open HTTP connection —
 * same polling pattern as the video download step).
 */
router.post("/:videoJobId", async (req, res) => {
  const videoJob = getJob(req.params.videoJobId);

  if (!videoJob) {
    return res.status(404).json({ error: "Video job not found." });
  }
  if (videoJob.status !== "done" || !videoJob.filePath) {
    return res.status(400).json({
      error: `Video job is not ready yet (status: ${videoJob.status}). Wait until it's "done" first.`,
    });
  }

  const { language } = req.body || {};

  const transcribeJob = createJob({
    type: "transcribe",
    source: videoJob.filePath,
  });
  updateJob(transcribeJob.id, { status: "processing", progress: 10 });

  res.status(202).json({ jobId: transcribeJob.id, status: "processing" });

  // Run the actual work AFTER responding, so the frontend gets the jobId
  // right away and can start polling GET /api/transcribe/status/:jobId.
  try {
    const audioPath = await extractAudio(videoJob.filePath);
    updateJob(transcribeJob.id, { progress: 50 });

    const result = await transcribeAudio(audioPath, { language });

    updateJob(transcribeJob.id, {
      status: "done",
      progress: 100,
      transcriptText: result.text,
      detectedLanguage: result.language,
      srtPath: result.srtPath,
      txtPath: result.txtPath,
    });
  } catch (err) {
    updateJob(transcribeJob.id, {
      status: "error",
      error: err.message,
    });
  }
});

/**
 * GET /api/transcribe/status/:jobId
 * Poll this to check progress and get the final transcript once done.
 */
router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }
  res.json(job);
});

module.exports = router;
