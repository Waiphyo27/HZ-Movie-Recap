const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const path = require("path");
const fs = require("fs");

const AUDIO_OUTPUT_DIR = process.env.TTS_AUDIO_DIR || "./tts-audio";

if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

const VOICE_PRESETS = {
  "my-MM-ThihaNeural": "Myanmar — Thiha, male",
  "my-MM-NilarNeural": "Myanmar — Nilar, female",

  "en-US-AndrewNeural": "English (US) — Andrew, male",
  "en-US-AvaNeural": "English (US) — Ava, female",
  "en-US-EmmaNeural": "English (US) — Emma, female",
  "en-US-GuyNeural": "English (US) — Guy, male",
  "en-US-JennyNeural": "English (US) — Jenny, female",
  "en-GB-RyanNeural": "English (UK) — Ryan, male",
  "en-GB-SoniaNeural": "English (UK) — Sonia, female",
  "en-AU-WilliamNeural": "English (Australia) — William, male",
  "en-AU-NatashaNeural": "English (Australia) — Natasha, female",
  "en-IN-PrabhatNeural": "English (India) — Prabhat, male",

  "zh-CN-YunxiNeural": "Chinese (Mandarin) — Yunxi, male",
  "zh-CN-XiaoxiaoNeural": "Chinese (Mandarin) — Xiaoxiao, female",
  "zh-CN-YunjianNeural": "Chinese (Mandarin) — Yunjian, male",
  "zh-TW-HsiaoChenNeural": "Chinese (Taiwan) — HsiaoChen, female",

  "th-TH-NiwatNeural": "Thai — Niwat, male",
  "th-TH-PremwadeeNeural": "Thai — Premwadee, female",

  "ja-JP-KeitaNeural": "Japanese — Keita, male",
  "ja-JP-NanamiNeural": "Japanese — Nanami, female",

  "ko-KR-InJoonNeural": "Korean — InJoon, male",
  "ko-KR-SunHiNeural": "Korean — SunHi, female",

  "vi-VN-NamMinhNeural": "Vietnamese — NamMinh, male",
  "vi-VN-HoaiMyNeural": "Vietnamese — HoaiMy, female",

  "hi-IN-MadhurNeural": "Hindi — Madhur, male",
  "hi-IN-SwaraNeural": "Hindi — Swara, female",

  "es-ES-AlvaroNeural": "Spanish (Spain) — Alvaro, male",
  "es-ES-ElviraNeural": "Spanish (Spain) — Elvira, female",
  "es-MX-JorgeNeural": "Spanish (Mexico) — Jorge, male",

  "fr-FR-HenriNeural": "French — Henri, male",
  "fr-FR-DeniseNeural": "French — Denise, female",

  "id-ID-ArdiNeural": "Indonesian — Ardi, male",
  "id-ID-GadisNeural": "Indonesian — Gadis, female",
};

async function generateSpeech(text, { voice = "en-US-AndrewNeural", jobId } = {}) {
  if (!text || !text.trim()) {
    throw new Error("Text is empty — nothing to convert to speech.");
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const tempDir = path.join(AUDIO_OUTPUT_DIR, jobId);
  fs.mkdirSync(tempDir, { recursive: true });

  await tts.toFile(tempDir, text);

  const generatedFile = path.join(tempDir, "audio.mp3");
  const finalPath = path.join(AUDIO_OUTPUT_DIR, `${jobId}.mp3`);
  fs.renameSync(generatedFile, finalPath);
  fs.rmdirSync(tempDir);

  return { audioPath: finalPath, voice };
}

async function listInstalledVoices() {
  return VOICE_PRESETS;
}

module.exports = { generateSpeech, listInstalledVoices, VOICE_PRESETS };