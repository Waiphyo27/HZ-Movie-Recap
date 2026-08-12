const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const AUDIO_DIR = process.env.AUDIO_DIR || "./audio";

if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

/**
 * Extracts audio from a video file as a mono 16kHz mp3.
 *
 * Why extract audio first instead of sending the whole video to Whisper:
 * 1. Whisper API only needs audio, not video frames — sending the full
 *    video wastes bandwidth and hits the 25MB upload limit fast.
 * 2. 16kHz mono is exactly what speech models expect, so this also avoids
 *    Whisper silently downsampling/discarding a stereo channel itself.
 *
 * Returns a Promise that resolves with the output audio file path.
 */
function extractAudio(videoFilePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoFilePath)) {
      return reject(new Error(`Video file not found: ${videoFilePath}`));
    }

    const outputId = path.basename(videoFilePath, path.extname(videoFilePath));
    const outputPath = path.join(AUDIO_DIR, `${outputId}.mp3`);

    const args = [
      "-i", videoFilePath,
      "-vn",              // no video
      "-ac", "1",         // mono
      "-ar", "16000",     // 16kHz sample rate (Whisper's native rate)
      "-b:a", "64k",      // keep file size small
      "-y",                // overwrite if exists
      outputPath,
    ];

    const proc = spawn("ffmpeg", args);

    let stderrBuffer = "";
    proc.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited with code ${code}: ${stderrBuffer.slice(-500)}`));
      }
      resolve(outputPath);
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}

module.exports = { extractAudio };
