const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TTS_MODEL = "gemini-3.1-flash-tts-preview";

const AUDIO_OUTPUT_DIR = process.env.TTS_AUDIO_DIR || "./tts-audio";
if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

const GEMINI_VOICES = {
  Zephyr: "Gemini — Zephyr",
  Puck: "Gemini — Puck (default)",
  Charon: "Gemini — Charon",
  Kore: "Gemini — Kore",
  Fenrir: "Gemini — Fenrir",
  Leda: "Gemini — Leda",
  Orus: "Gemini — Orus",
  Aoede: "Gemini — Aoede",
  Callirrhoe: "Gemini — Callirrhoe",
  Autonoe: "Gemini — Autonoe",
  Enceladus: "Gemini — Enceladus",
  Iapetus: "Gemini — Iapetus",
  Umbriel: "Gemini — Umbriel",
  Algieba: "Gemini — Algieba",
  Despina: "Gemini — Despina",
  Erinome: "Gemini — Erinome",
  Algenib: "Gemini — Algenib",
  Rasalgethi: "Gemini — Rasalgethi",
  Laomedeia: "Gemini — Laomedeia",
  Achernar: "Gemini — Achernar",
  Alnilam: "Gemini — Alnilam",
  Schedar: "Gemini — Schedar",
  Gacrux: "Gemini — Gacrux",
  Pulcherrima: "Gemini — Pulcherrima",
  Achird: "Gemini — Achird",
  Zubenelgenubi: "Gemini — Zubenelgenubi",
  Vindemiatrix: "Gemini — Vindemiatrix",
  Sadachbia: "Gemini — Sadachbia",
  Sadaltager: "Gemini — Sadaltager",
  Sulafat: "Gemini — Sulafat",
};

function pcmToMp3(pcmBuffer, outputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-f", "s16le",
      "-ar", "24000",
      "-ac", "1",
      "-i", "pipe:0",
      "-y",
      outputPath,
    ];
    const proc = spawn("ffmpeg", args);

    let stderrBuffer = "";
    proc.stderr.on("data", (d) => (stderrBuffer += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg PCM->mp3 conversion failed: ${stderrBuffer.slice(-500)}`));
      }
      resolve();
    });

    proc.on("error", (err) => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
    proc.stdin.write(pcmBuffer);
    proc.stdin.end();
  });
}

async function callGeminiTTS(text, voice, apiKey, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const key = apiKey || GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set — add your own key in the API Keys section above.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`;

  const response = await fetch(`${url}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const is429 = response.status === 429;
    if (is429 && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 2000));
      return callGeminiTTS(text, voice, apiKey, attempt + 1);
    }
    throw new Error(`Gemini TTS API error (${response.status}): ${errText.slice(0, 500)}`);
  }

  const result = await response.json();
  const base64Data = result.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Data) {
    throw new Error("Gemini TTS returned no audio data.");
  }

  return Buffer.from(base64Data, "base64");
}

async function generateSpeechGemini(text, { voice = "Puck", jobId, apiKey = null } = {}) {
  if (!text || !text.trim()) {
    throw new Error("Text is empty — nothing to convert to speech.");
  }

  const pcmBuffer = await callGeminiTTS(text, voice, apiKey);
  const finalPath = path.join(AUDIO_OUTPUT_DIR, `${jobId}.mp3`);
  await pcmToMp3(pcmBuffer, finalPath);

  return { audioPath: finalPath, voice };
}

async function listGeminiVoices() {
  return GEMINI_VOICES;
}

module.exports = { generateSpeechGemini, listGeminiVoices, GEMINI_VOICES };