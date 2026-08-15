const express = require("express");
const router = express.Router();

const { generateSpeech, listInstalledVoices, GEMINI_VOICE_PRESETS } = require("../services/ttsGenerator");
const { createJob, updateJob, getJob } = require("../services/jobStore");

router.get("/voices", async (req, res) => {
  try {
    if (req.query.provider === "gemini") {
      return res.json(GEMINI_VOICE_PRESETS);
    }
    const voices = await listInstalledVoices();
    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:sourceJobId", async (req, res) => {
  const sourceJob = getJob(req.params.sourceJobId);

  if (!sourceJob) {
    return res.status(404).json({ error: "Source job not found." });
  }
  if (sourceJob.status !== "done") {
    return res.status(400).json({
      error: `Source job is not ready yet (status: ${sourceJob.status}).`,
    });
  }

  const textToSpeak = sourceJob.translatedText || sourceJob.scriptText;
  if (!textToSpeak) {
    return res.status(400).json({
      error: "Source job has no scriptText or translatedText to convert to speech.",
    });
  }

  const { voice, provider, apiKey } = req.body || {};

  const ttsJob = createJob({ type: "tts", source: req.params.sourceJobId });
  updateJob(ttsJob.id, { status: "processing", progress: 20 });

  res.status(202).json({ jobId: ttsJob.id, status: "processing" });

  try {
    const { audioPath, voice: usedVoice } = await generateSpeech(textToSpeak, {
      voice,
      jobId: ttsJob.id,
      provider: provider || "edge",
      apiKey: apiKey || null,
    });

    updateJob(ttsJob.id, {
      status: "done",
      progress: 100,
      audioPath,
      voice: usedVoice,
    });
  } catch (err) {
    console.error("TTS generation failed:", err);
    const errorMessage = err && err.message ? err.message : JSON.stringify(err) || "Unknown TTS error";
    updateJob(ttsJob.id, { status: "error", error: errorMessage });
  }
});

router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

module.exports = router;