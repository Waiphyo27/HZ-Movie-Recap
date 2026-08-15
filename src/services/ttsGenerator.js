const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const AUDIO_OUTPUT_DIR = process.env.TTS_AUDIO_DIR || "./tts-audio";

if (!fs.existsSync(AUDIO_OUTPUT_DIR)) {
  fs.mkdirSync(AUDIO_OUTPUT_DIR, { recursive: true });
}

const WANTED_LOCALE_PREFIXES = [
  "my-MM",
  "en-US", "en-GB", "en-AU", "en-IN",
  "zh-CN", "zh-TW",
  "th-TH",
  "ja-JP",
  "ko-KR",
  "vi-VN",
  "hi-IN",
  "es-ES", "es-MX",
  "fr-FR",
  "id-ID",
];

function localeDisplayName(locale) {
  const names = {
    "my-MM": "Myanmar",
    "en-US": "English (US)",
    "en-GB": "English (UK)",
    "en-AU": "English (Australia)",
    "en-IN": "English (India)",
    "zh-CN": "Chinese (Mandarin)",
    "zh-TW": "Chinese (Taiwan)",
    "th-TH": "Thai",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "vi-VN": "Vietnamese",
    "hi-IN": "Hindi",
    "es-ES": "Spanish (Spain)",
    "es-MX": "Spanish (Mexico)",
    "fr-FR": "French",
    "id-ID": "Indonesian",
  };
  return names[locale] || locale;
}

let cachedVoicePresets = null;

async function loadVoicePresetsFromLibrary() {
  if (cachedVoicePresets) return cachedVoicePresets;

  try {
    const tts = new MsEdgeTTS();
    const allVoices = await tts.getVoices();

    const presets = {};
    for (const v of allVoices) {
      const shortName = v.ShortName || v.Name;
      if (!shortName) continue;
      const locale = v.Locale || shortName.split("-").slice(0, 2).join("-");
      if (!WANTED_LOCALE_PREFIXES.includes(locale)) continue;

      const gender = v.Gender || "";
      const friendlyMatch = shortName.match(/-([A-Za-z]+)Neural/);
      const name = friendlyMatch ? friendlyMatch[1] : shortName;
      presets[shortName] = `${localeDisplayName(locale)} — ${name}${gender ? `, ${gender.toLowerCase()}` : ""}`;
    }

    if (Object.keys(presets).length > 0) {
      cachedVoicePresets = presets;
      return presets;
    }
  } catch (err) {
    console.error("Could not fetch live voice list, falling back to static list:", err.message);
  }

  cachedVoicePresets = {
    "my-MM-ThihaNeural": "Myanmar — Thiha, male",
    "my-MM-NilarNeural": "Myanmar — Nilar, female",
    "en-US-AndrewNeural": "English (US) — Andrew, male",
    "en-US-AvaNeural": "English (US) — Ava, female",
    "zh-CN-XiaoxiaoNeural": "Chinese (Mandarin) — Xiaoxiao, female",
  };
  return cachedVoicePresets;
}

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

// Retries a few times on failure — "No audio data received" is a
// well-documented, transient issue with Microsoft's underlying (and
// unofficial) TTS endpoint. It isn't specific to any one voice; a fresh
// connection attempt usually succeeds.
async function generateSpeechChunk(text, voice, outputPath, attempt = 1) {
  const MAX_ATTEMPTS = 4;

  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const tempDir = `${outputPath}-tmp`;
    fs.mkdirSync(tempDir, { recursive: true });

    await tts.toFile(tempDir, text);

    const generatedFile = path.join(tempDir, "audio.mp3");
    fs.renameSync(generatedFile, outputPath);
    fs.rmdirSync(tempDir);
  } catch (err) {
    const isRetryable = /no audio data|no audio was received|econnreset|timeout/i.test(
      err.message || ""
    );
    if (isRetryable && attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, attempt * 1000));
      return generateSpeechChunk(text, voice, outputPath, attempt + 1);
    }
    throw err;
  }
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
  return loadVoicePresetsFromLibrary();
}

module.exports = { generateSpeech, listInstalledVoices };