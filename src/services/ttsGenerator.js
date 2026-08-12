const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const { spawn } = require("child_process");
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

function splitTextForTTS(text, maxChars = 200) {
  const sentences = text
    .split(/(?<=[.!?။])\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return [text.trim()];

  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current.length + sentence.length + 1) > maxChars) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);

  return chunks.length > 0 ? chunks : [text.trim()];
}

async function generateSpeechChunk(text, voice, outputPath) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const tempDir = `${outputPath}-tmp`;
  fs.mkdirSync(tempDir, { recursive: true });

  await tts.toFile(tempDir, text);

  const generatedFile = path.join(tempDir, "audio.mp3");
  fs.renameSync(generatedFile, outputPath);
  fs.rmdirSync(tempDir);
}

function concatAudioFiles(filePaths, outputPath) {
  return new Promise((resolve, reject) => {
    const listPath = `${outputPath}.concatlist.txt`;
    const listContent = filePaths
      .map((p) => {
        const absPath = path.resolve(p).replace(/\\/g, "/");
        return `file '${absPath.replace(/'/g, "'\\''")}'`;
      })
      .join("\n");
    fs.writeFileSync(listPath, listContent, "utf-8");

    const args = ["-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", outputPath];
    const proc = spawn("ffmpeg", args);

    let stderrBuffer = "";
    proc.stderr.on("data", (d) => (stderrBuffer += d.toString()));

    proc.on("close", (code) => {
      fs.unlinkSync(listPath);
      if (code !== 0) {
        return reject(new Error(`ffmpeg audio concat failed: ${stderrBuffer.slice(-500)}`));
      }
      resolve();
    });

    proc.on("error", (err) => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
  });
}

async function generateSpeech(text, { voice = "en-US-AndrewNeural", jobId } = {}) {
  if (!text || !text.trim()) {
    throw new Error("Text is empty — nothing to convert to speech.");
  }

  const chunks = splitTextForTTS(text);
  const finalPath = path.join(AUDIO_OUTPUT_DIR, `${jobId}.mp3`);

  if (chunks.length === 1) {
    await generateSpeechChunk(chunks[0], voice, finalPath);
    return { audioPath: finalPath, voice };
  }

  const chunkPaths = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = path.join(AUDIO_OUTPUT_DIR, `${jobId}-part${i}.mp3`);
    await generateSpeechChunk(chunks[i], voice, chunkPath);
    chunkPaths.push(chunkPath);
  }

  await concatAudioFiles(chunkPaths, finalPath);

  chunkPaths.forEach((p) => {
    try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
  });

  return { audioPath: finalPath, voice };
}

async function listInstalledVoices() {
  return VOICE_PRESETS;
}

module.exports = { generateSpeech, listInstalledVoices, VOICE_PRESETS };