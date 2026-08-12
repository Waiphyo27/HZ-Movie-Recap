const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const { translateScript } = require("../services/translator");
const { createJob, updateJob, getJob } = require("../services/jobStore");

const TRANSLATION_DIR = process.env.TRANSLATION_DIR || "./translations";
if (!fs.existsSync(TRANSLATION_DIR)) {
  fs.mkdirSync(TRANSLATION_DIR, { recursive: true });
}

/**
 * POST /api/translate/:scriptJobId
 * body: { "targetLanguage": "Myanmar (Burmese)" }
 *
 * Takes a completed script-generation job and translates its scriptText
 * into the target language via Groq's free Llama model.
 */
router.post("/:scriptJobId", async (req, res) => {
  const scriptJob = getJob(req.params.scriptJobId);

  if (!scriptJob) {
    return res.status(404).json({ error: "Script job not found." });
  }
  if (scriptJob.status !== "done" || !scriptJob.scriptText) {
    return res.status(400).json({
      error: `Script job is not ready yet (status: ${scriptJob.status}).`,
    });
  }

  const { targetLanguage, provider } = req.body || {};
  if (!targetLanguage) {
    return res.status(400).json({
      error: "targetLanguage is required, e.g. 'Myanmar (Burmese)', 'English', 'Chinese'.",
    });
  }

  const translateJob = createJob({ type: "translate", source: req.params.scriptJobId });
  updateJob(translateJob.id, { status: "processing", progress: 20 });

  res.status(202).json({ jobId: translateJob.id, status: "processing" });

  try {
    const { translatedText } = await translateScript(scriptJob.scriptText, targetLanguage, provider || "groq");

    const translationPath = path.join(TRANSLATION_DIR, `${translateJob.id}.txt`);
    fs.writeFileSync(translationPath, translatedText, "utf-8");

    updateJob(translateJob.id, {
      status: "done",
      progress: 100,
      translatedText,
      targetLanguage,
      translationPath,
    });
  } catch (err) {
    updateJob(translateJob.id, { status: "error", error: err.message });
  }
});

/**
 * GET /api/translate/status/:jobId
 */
router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

module.exports = router;
