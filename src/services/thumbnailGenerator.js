const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const THUMBNAIL_DIR = process.env.THUMBNAIL_DIR || "./thumbnails";
if (!fs.existsSync(THUMBNAIL_DIR)) fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

function getVideoDimensions(videoPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=s=x:p=0",
      videoPath,
    ];
    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr.slice(-300)}`));
      const [w, h] = stdout.trim().split("x").map(Number);
      if (!w || !h) return reject(new Error(`Could not parse dimensions from: ${stdout}`));
      resolve({ width: w, height: h });
    });
    proc.on("error", (err) => reject(new Error(`Failed to start ffprobe: ${err.message}`)));
  });
}

function generateThumbnail(videoPath, jobId) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(THUMBNAIL_DIR, `${jobId}.jpg`);
    const args = [
      "-ss", "1",
      "-i", videoPath,
      "-frames:v", "1",
      "-q:v", "3",
      "-y",
      outputPath,
    ];
    const proc = spawn("ffmpeg", args);

    let stderrBuffer = "";
    proc.stderr.on("data", (d) => (stderrBuffer += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(outputPath)) {
        return reject(new Error(`ffmpeg thumbnail generation failed: ${stderrBuffer.slice(-500)}`));
      }
      resolve(outputPath);
    });

    proc.on("error", (err) => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
  });
}

module.exports = { getVideoDimensions, generateThumbnail, THUMBNAIL_DIR };