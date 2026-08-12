const fs = require("fs");
const path = require("path");
const { segmentsToSrt } = require("../utils/srtFormatter");

// Groq's API is free (generous rate limits, no credit card) and is
// OpenAI-compatible — same request/response shape as OpenAI's Whisper API,
// just a different base URL, API key, and model name. If you later want to
// switch to OpenAI (e.g. for higher rate limits), you only need to change
// these three lines plus the env var name.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHISPER_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-large-v3";

const TRANSCRIPT_DIR = process.env.TRANSCRIPT_DIR || "./transcripts";

if (!fs.existsSync(TRANSCRIPT_DIR)) {
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
}

/**
 * Sends an audio file to Groq's (free, OpenAI-compatible) Whisper API and
 * returns both the plain transcript text and an .srt subtitle file (with
 * timestamps), saved to TRANSCRIPT_DIR.
 *
 * Uses Node's built-in fetch + FormData (available natively since Node 18,
 * no extra npm package needed for this part).
 */
async function transcribeAudio(audioFilePath, { language = null } = {}) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY is not set. Add it to your .env file — get a free one at https://console.groq.com/keys"
    );
  }

  if (!fs.existsSync(audioFilePath)) {
    throw new Error(`Audio file not found: ${audioFilePath}`);
  }

  const audioBuffer = fs.readFileSync(audioFilePath);
  const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });

  const form = new FormData();
  form.append("file", audioBlob, path.basename(audioFilePath));
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json"); // gives us segment timestamps
  if (language) form.append("language", language); // e.g. "zh", "en" — skip to auto-detect

  const response = await fetch(WHISPER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  // result shape: { text, language, duration, segments: [{ start, end, text }, ...] }

  const baseId = path.basename(audioFilePath, path.extname(audioFilePath));
  const srtContent = segmentsToSrt(result.segments || []);
  const srtPath = path.join(TRANSCRIPT_DIR, `${baseId}.srt`);
  const txtPath = path.join(TRANSCRIPT_DIR, `${baseId}.txt`);

  fs.writeFileSync(srtPath, srtContent, "utf-8");
  fs.writeFileSync(txtPath, result.text, "utf-8");

  return {
    text: result.text,
    language: result.language,
    duration: result.duration,
    segments: result.segments || [],
    srtPath,
    txtPath,
  };
}

module.exports = { transcribeAudio };
