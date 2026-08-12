const express = require("express");
const router = express.Router();

const { upload } = require("../services/uploadHandler");
const { startLinkDownload } = require("../services/linkDownloader");
const { createJob, updateJob, getJob } = require("../services/jobStore");
const { isValidUrl, detectPlatform } = require("../utils/platformDetector");
const { getVideoDimensions, generateThumbnail } = require("../services/thumbnailGenerator");

router.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No video file received." });
  }

  const job = createJob({ type: "upload", source: req.file.originalname });
  updateJob(job.id, {
    status: "done",
    progress: 100,
    filePath: req.file.path,
  });

  res.status(201).json({ jobId: job.id, status: "done" });
});

router.post("/link", (req, res) => {
  const { url } = req.body;

  if (!url || !isValidUrl(url)) {
    return res.status(400).json({ error: "A valid video URL is required." });
  }

  const platform = detectPlatform(url);
  const job = startLinkDownload(url);

  res.status(202).json({
    jobId: job.id,
    status: job.status,
    platform: platform.id,
  });
});

router.get("/status/:jobId", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found." });
  }
  res.json(job);
});

router.get("/:jobId/thumbnail", async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job || job.status !== "done" || !job.filePath) {
    return res.status(400).json({ error: "Video job is not ready yet." });
  }

  try {
    const dimensions = await getVideoDimensions(job.filePath);
    const thumbnailPath = await generateThumbnail(job.filePath, req.params.jobId);
    const fileName = thumbnailPath.split(/[\\/]/).pop();

    res.json({
      thumbnailUrl: `/files/thumbnails/${fileName}`,
      width: dimensions.width,
      height: dimensions.height,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;