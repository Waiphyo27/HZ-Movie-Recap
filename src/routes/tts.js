const express = require("express");
const router = express.Router();

const { generateSpeech, listInstalledVoices } = require("../services/ttsGenerator");
const { createJob, updateJob, getJob } = require("../services/jobStore");

/**
 * GET /api/tts/voices
 * Lists voices actually installed on this Windows machine.
 */
router.get("/voices", async (req, res) => {
  try {
    const voices = await listInstalledVoices();
    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tts/:sourceJobId
 * body (optional): { "voice": "en-US-AndrewNeural" }
 *
 * sourceJobId can be EITHER a script-generation job OR a translation job —
 * this route auto-detects which text to use:
 *   - translate job -> uses translatedText (voice in the translated language)
 *   - script job     -> uses scriptText (voice in the original language)
 */
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

  const { voice } = req.body || {};

  const ttsJob = createJob({ type: "tts", source: req.params.sourceJobId });
  updateJob(ttsJob.id, { status: "processing", progress: 20 });

  res.status(202).json({ jobId: ttsJob.id, status: "processing" });

  try {
    const { audioPath, voice: usedVoice } = await generateSpeech(textToSpeak, {
      voice,
      jobId: ttsJob.id,
    });

    updateJob(ttsJob.id, {
      status: "done",
      progress: 100,
      audioPath,
      voice: usedVoice,
    });
  } catch (err) {
    // Log the full error to the server terminal — some libraries throw
    // non-Error objects whose .message is empty, so we fall back to
    // stringifying the whole thing.
    console.error("TTS generation failed:", err);
    const errorMessage = err && err.message ? err.message : JSON.stringify(err) || "Unknown TTS error";
    updateJob(ttsJob.id, { status: "error", error: errorMessage });
  }
});

/**
 * GET /api/tts/status/:jobId
 */
router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

module.exports = router;
