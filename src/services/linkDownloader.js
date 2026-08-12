const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { detectPlatform } = require("../utils/platformDetector");
const { createJob, updateJob } = require("./jobStore");

const YT_DLP_PATH = process.env.YT_DLP_PATH || "yt-dlp";
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || "./downloads";

if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

const PROGRESS_REGEX = /\[download\]\s+(\d{1,3}(?:\.\d+)?)%/;

const PLAYER_CLIENT_ATTEMPTS = ["android,tv", "ios", "web_safari", "default"];

function buildArgs(url, outputTemplate, playerClient) {
  const args = [
    url,
    "-o",
    outputTemplate,
    "--newline",
    "--no-playlist",
    "--format",
    "mp4/best",
    "--extractor-args",
    `youtube:player_client=${playerClient}`,
  ];

  if (process.env.YT_DLP_COOKIES_FROM_BROWSER) {
    args.push("--cookies-from-browser", process.env.YT_DLP_COOKIES_FROM_BROWSER);
  } else if (process.env.YT_DLP_COOKIES && fs.existsSync(process.env.YT_DLP_COOKIES)) {
    args.push("--cookies", process.env.YT_DLP_COOKIES);
  }

  return args;
}

function runYtDlp(url, outputTemplate, playerClient, onProgress) {
  return new Promise((resolve, reject) => {
    const args = buildArgs(url, outputTemplate, playerClient);
    const proc = spawn(YT_DLP_PATH, args);

    proc.stdout.on("data", (chunk) => {
      const line = chunk.toString();
      const match = line.match(PROGRESS_REGEX);
      if (match) onProgress(Math.min(99, Math.round(parseFloat(match[1]))));
    });

    let stderrBuffer = "";
    proc.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(stderrBuffer.trim().slice(-800) || `yt-dlp exited with code ${code}`));
      }
      resolve();
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });
  });
}

function startLinkDownload(url) {
  const platform = detectPlatform(url);
  const job = createJob({ type: "link", source: url });
  const outputTemplate = path.join(DOWNLOAD_DIR, `${job.id}.%(ext)s`);

  updateJob(job.id, { status: "processing", platform: platform.id });

  (async () => {
    let lastError = null;

    for (const playerClient of PLAYER_CLIENT_ATTEMPTS) {
      try {
        await runYtDlp(url, outputTemplate, playerClient, (progress) => {
          updateJob(job.id, { progress });
        });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const isRetryableError =
          /Visitor Data|PO Token|Sign in to confirm|cookies/i.test(err.message);
        if (!isRetryableError) break;
      }
    }

    if (lastError) {
      updateJob(job.id, { status: "error", error: lastError.message });
      return;
    }

    const produced = fs.readdirSync(DOWNLOAD_DIR).find((f) => f.startsWith(job.id));

    if (!produced) {
      updateJob(job.id, {
        status: "error",
        error: "Download finished but output file was not found.",
      });
      return;
    }

    updateJob(job.id, {
      status: "done",
      progress: 100,
      filePath: path.join(DOWNLOAD_DIR, produced),
    });
  })();

  return job;
}

module.exports = { startLinkDownload };