const fs = require("fs");
const path = require("path");
const { segmentsToSrt } = require("../utils/srtFormatter");

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const WHISPER_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-large-v3";

const TRANSCRIPT_DIR = process.env.TRANSCRIPT_DIR || "./transcripts";

if (!fs.existsSync(TRANSCRIPT_DIR)) {
  fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });
}

async function transcribeAudio(audioFilePath, { language = null, apiKey = null } = {}) {
  const effectiveKey = apiKey || GROQ_API_KEY;
  if (!effectiveKey) {
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
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);

  const response = await fetch(WHISPER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${effectiveKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();

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