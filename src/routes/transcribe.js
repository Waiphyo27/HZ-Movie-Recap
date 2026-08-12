const express = require("express");
const router = express.Router();

const { extractAudio } = require("../services/audioExtractor");
const { transcribeAudio } = require("../services/transcriber");
const { createJob, updateJob, getJob } = require("../services/jobStore");

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

  const { language, groqApiKey } = req.body || {};

  const transcribeJob = createJob({
    type: "transcribe",
    source: videoJob.filePath,
  });
  updateJob(transcribeJob.id, { status: "processing", progress: 10 });

  res.status(202).json({ jobId: transcribeJob.id, status: "processing" });

  try {
    const audioPath = await extractAudio(videoJob.filePath);
    updateJob(transcribeJob.id, { progress: 50 });

    const result = await transcribeAudio(audioPath, { language, apiKey: groqApiKey || null });

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

router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }
  res.json(job);
});

module.exports = router;