const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const { generateRecapScript, TONE_PRESETS } = require("../services/scriptGenerator");
const { createJob, updateJob, getJob } = require("../services/jobStore");

const SCRIPT_DIR = process.env.SCRIPT_DIR || "./scripts";
if (!fs.existsSync(SCRIPT_DIR)) {
  fs.mkdirSync(SCRIPT_DIR, { recursive: true });
}

router.get("/tones", (req, res) => {
  res.json(Object.keys(TONE_PRESETS));
});

router.post("/custom", (req, res) => {
  const { text } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text is required." });
  }

  const scriptJob = createJob({ type: "script", source: "manual" });

  const scriptPath = path.join(SCRIPT_DIR, `${scriptJob.id}.txt`);
  fs.writeFileSync(scriptPath, text, "utf-8");

  updateJob(scriptJob.id, {
    status: "done",
    progress: 100,
    scriptText: text,
    scriptPath,
  });

  res.status(201).json({ jobId: scriptJob.id, status: "done" });
});

router.post("/:transcribeJobId", async (req, res) => {
  const transcribeJob = getJob(req.params.transcribeJobId);

  if (!transcribeJob) {
    return res.status(404).json({ error: "Transcription job not found." });
  }
  if (transcribeJob.status !== "done" || !transcribeJob.transcriptText) {
    return res.status(400).json({
      error: `Transcription job is not ready yet (status: ${transcribeJob.status}).`,
    });
  }

  const { style, groqApiKey } = req.body || {};

  const scriptJob = createJob({ type: "script", source: req.params.transcribeJobId });
  updateJob(scriptJob.id, { status: "processing", progress: 20 });

  res.status(202).json({ jobId: scriptJob.id, status: "processing" });

  try {
    const { scriptText } = await generateRecapScript(transcribeJob.transcriptText, {
      style,
      apiKey: groqApiKey || null,
    });

    const scriptPath = path.join(SCRIPT_DIR, `${scriptJob.id}.txt`);
    fs.writeFileSync(scriptPath, scriptText, "utf-8");

    updateJob(scriptJob.id, {
      status: "done",
      progress: 100,
      scriptText,
      scriptPath,
    });
  } catch (err) {
    updateJob(scriptJob.id, { status: "error", error: err.message });
  }
});

router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

module.exports = router;