const express = require("express");
const router = express.Router();

const { generateSpeech, listInstalledVoices } = require("../services/ttsGenerator");
const { generateSpeechGemini, listGeminiVoices } = require("../services/geminiTtsGenerator");
const { createJob, updateJob, getJob } = require("../services/jobStore");

/**
 * GET /api/tts/voices?provider=edge|gemini
 */
router.get("/voices", async (req, res) => {
  try {
    const provider = req.query.provider === "gemini" ? "gemini" : "edge";
    const voices = provider === "gemini" ? await listGeminiVoices() : await listInstalledVoices();
    res.json(voices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tts/:sourceJobId
 * body: { "voice": "...", "provider": "edge"|"gemini", "apiKey": "..." (Gemini only) }
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

  const { voice, provider, apiKey } = req.body || {};
  const useGemini = provider === "gemini";

  const ttsJob = createJob({ type: "tts", source: req.params.sourceJobId });
  updateJob(ttsJob.id, { status: "processing", progress: 20 });

  res.status(202).json({ jobId: ttsJob.id, status: "processing" });

  try {
    const { audioPath, voice: usedVoice } = useGemini
      ? await generateSpeechGemini(textToSpeak, { voice: voice || "Puck", jobId: ttsJob.id, apiKey })
      : await generateSpeech(textToSpeak, { voice, jobId: ttsJob.id });

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