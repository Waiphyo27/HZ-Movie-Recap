const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { formatTimestamp } = require("../utils/srtFormatter");

const RENDER_DIR = process.env.RENDER_DIR || "./renders";
const SUBTITLE_DIR = process.env.SUBTITLE_DIR || "./render-subtitles";

if (!fs.existsSync(RENDER_DIR)) fs.mkdirSync(RENDER_DIR, { recursive: true });
if (!fs.existsSync(SUBTITLE_DIR)) fs.mkdirSync(SUBTITLE_DIR, { recursive: true });

function getDuration(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ];
    const proc = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe failed: ${stderr.slice(-300)}`));
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration)) return reject(new Error(`Could not parse duration from: ${stdout}`));
      resolve(duration);
    });
    proc.on("error", (err) => reject(new Error(`Failed to start ffprobe: ${err.message}`)));
  });
}

function splitIntoSentences(text) {
  let parts = text
    .split(/(?<=[.!?။])\s*/u)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length === 0) parts = [text.trim()];

  const MAX_CHARS = 60;
  const result = [];
  for (const part of parts) {
    if (part.length <= MAX_CHARS) {
      result.push(part);
      continue;
    }
    let remaining = part;
    while (remaining.length > MAX_CHARS) {
      let cut = remaining.lastIndexOf(" ", MAX_CHARS);
      if (cut <= 0) cut = MAX_CHARS;
      result.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) result.push(remaining);
  }

  return result.filter(Boolean);
}

function generateSimpleSrt(sentences, perSentenceDuration, outputPath) {
  const srtContent = sentences
    .map((sentence, i) => {
      const start = formatTimestamp(i * perSentenceDuration);
      const end = formatTimestamp((i + 1) * perSentenceDuration);
      return `${i + 1}\n${start} --> ${end}\n${sentence}\n`;
    })
    .join("\n");

  fs.writeFileSync(outputPath, srtContent, "utf-8");
  return outputPath;
}

function escapePathForFfmpegFilter(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function escapeDrawtext(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%");
}

const SUBTITLE_POSITIONS = {
  top: 8,
  middle: 5,
  bottom: 2,
};

const WINDOWS_DEFAULT_FONT = "C:/Windows/Fonts/arial.ttf";

const ASPECT_RATIOS = {
  original: null,
  "9:16": { w: 720, h: 1280 },
  "1:1": { w: 720, h: 720 },
  "4:5": { w: 720, h: 900 },
  "16:9": { w: 1280, h: 720 },
};

async function renderVideo({
  videoPath,
  audioPath,
  narrationText,
  jobId,
  subtitlePosition = "bottom",
  subtitlesEnabled = true,
  watermarkText = null,
  logoPath = null,
  logoPosition = null,
  aspectRatio = "original",
  blurRegion = "none",
  blurBox = null,
}) {
  const videoDuration = await getDuration(videoPath);
  const audioDuration = await getDuration(audioPath);

  const sentences = splitIntoSentences(narrationText);
  const subtitleCount = Math.max(1, sentences.length);
  const subtitleDuration = audioDuration / subtitleCount;

  const MAX_VISUAL_CLIPS = 10;
  const MIN_CLIP_SECONDS = 2;
  const clipCount = Math.max(
    1,
    Math.min(subtitleCount, MAX_VISUAL_CLIPS, Math.floor(videoDuration / MIN_CLIP_SECONDS) || 1)
  );
  const clipDuration = audioDuration / clipCount;

  const maxStart = Math.max(0, videoDuration - clipDuration);
  const clipStarts = [];
  for (let i = 0; i < clipCount; i++) {
    const fraction = clipCount === 1 ? 0 : i / (clipCount - 1);
    clipStarts.push(Math.min(maxStart, fraction * maxStart));
  }

  const srtPath = path.join(SUBTITLE_DIR, `${jobId}.srt`);
  generateSimpleSrt(sentences, subtitleDuration, srtPath);
  const escapedSrtPath = escapePathForFfmpegFilter(srtPath);

  const outputPath = path.join(RENDER_DIR, `${jobId}.mp4`);

  const filterLines = [];

  clipStarts.forEach((start, i) => {
    filterLines.push(
      `[0:v]trim=start=${start.toFixed(3)}:duration=${clipDuration.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`
    );
  });
  const concatInputs = clipStarts.map((_, i) => `[v${i}]`).join("");
  filterLines.push(`${concatInputs}concat=n=${clipCount}:v=1:a=0[vconcat]`);
  let currentLabel = "vconcat";

  if (blurBox && typeof blurBox.x === "number") {
    const { x, y, w, h } = blurBox;
    filterLines.push(`[${currentLabel}]split=2[bx_main][bx_strip]`);
    filterLines.push(
      `[bx_strip]crop=w=iw*${w}:h=ih*${h}:x=iw*${x}:y=ih*${y},boxblur=18:6[bx_blurred]`
    );
    filterLines.push(`[bx_main][bx_blurred]overlay=x=W*${x}:y=H*${y}[vblurbox]`);
    currentLabel = "vblurbox";
  } else if (blurRegion === "top" || blurRegion === "bottom" || blurRegion === "both") {
    const stripHeightFraction = 0.18;
    const doTop = blurRegion === "top" || blurRegion === "both";
    const doBottom = blurRegion === "bottom" || blurRegion === "both";

    let stepIndex = 0;
    if (doTop) {
      const outLabel = `vblurtop`;
      filterLines.push(`[${currentLabel}]split=2[bt_main${stepIndex}][bt_strip${stepIndex}]`);
      filterLines.push(
        `[bt_strip${stepIndex}]crop=w=iw:h=ih*${stripHeightFraction}:x=0:y=0,boxblur=18:6[bt_blurred${stepIndex}]`
      );
      filterLines.push(`[bt_main${stepIndex}][bt_blurred${stepIndex}]overlay=x=0:y=0[${outLabel}]`);
      currentLabel = outLabel;
      stepIndex++;
    }
    if (doBottom) {
      const outLabel = `vblurbottom`;
      filterLines.push(`[${currentLabel}]split=2[bb_main${stepIndex}][bb_strip${stepIndex}]`);
      filterLines.push(
        `[bb_strip${stepIndex}]crop=w=iw:h=ih*${stripHeightFraction}:x=0:y=ih*(1-${stripHeightFraction}),boxblur=18:6[bb_blurred${stepIndex}]`
      );
      filterLines.push(
        `[bb_main${stepIndex}][bb_blurred${stepIndex}]overlay=x=0:y=H-h[${outLabel}]`
      );
      currentLabel = outLabel;
    }
  }

  const args = ["-i", videoPath, "-i", audioPath];
  let logoInputIndex = null;
  if (logoPath) {
    logoInputIndex = args.length / 2;
    args.push("-i", logoPath);
  }

  if (logoPath) {
    filterLines.push(`[${logoInputIndex}:v]scale=120:-1[logoscaled]`);
    if (logoPosition && typeof logoPosition.x === "number") {
      filterLines.push(
        `[${currentLabel}][logoscaled]overlay=x=W*${logoPosition.x}:y=H*${logoPosition.y}[vlogo]`
      );
    } else {
      filterLines.push(`[${currentLabel}][logoscaled]overlay=W-w-20:20[vlogo]`);
    }
    currentLabel = "vlogo";
  }

  const targetDims = ASPECT_RATIOS[aspectRatio];
  if (targetDims) {
    const { w, h } = targetDims;
    filterLines.push(
      `[${currentLabel}]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x14101f[vpadded]`
    );
    currentLabel = "vpadded";
  }

  if (subtitlesEnabled) {
    const alignment = SUBTITLE_POSITIONS[subtitlePosition] || SUBTITLE_POSITIONS.bottom;
    filterLines.push(
      `[${currentLabel}]subtitles='${escapedSrtPath}':force_style='Fontname=Noto Sans Myanmar\\,Alignment=${alignment}\\,MarginV=40'[vsub]`
      );
    currentLabel = "vsub";
  }

  if (watermarkText) {
    const safeText = escapeDrawtext(watermarkText);
    const escapedFont = escapePathForFfmpegFilter(WINDOWS_DEFAULT_FONT);
    filterLines.push(
      `[${currentLabel}]drawtext=fontfile='${escapedFont}':text='${safeText}':fontcolor=white:fontsize=26:box=1:boxcolor=black@0.4:boxborderw=8:x=w-tw-20:y=h-th-20[vout]`
    );
    currentLabel = "vout";
  }

  const filterComplex = filterLines.join(";\n");

  args.push(
    "-filter_complex", filterComplex,
    "-map", `[${currentLabel}]`,
    "-map", "1:a",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-threads", "1",
    "-c:a", "aac",
    "-shortest",
    "-y",
    outputPath
  );

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);

    let stderrBuffer = "";
    proc.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg render failed (code ${code}): ${stderrBuffer.slice(-1200)}`));
      }
      if (!fs.existsSync(outputPath)) {
        return reject(new Error("Render finished but output file was not found."));
      }
      resolve({ outputPath, srtPath, clipCount, clipDuration, videoDuration, audioDuration });
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
  });
}

module.exports = { renderVideo, getDuration };