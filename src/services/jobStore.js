const { v4: uuidv4 } = require("uuid");

/**
 * Very small in-memory job store.
 *
 * This exists so the "Job Status" panel in the UI (matches the screenshot's
 * "Recap Job — PROCESSING — 15%") has something to poll immediately.
 *
 * IMPORTANT: this is intentionally simple and NOT production-ready —
 * it resets on server restart and won't work across multiple server
 * instances. When you add the queue module later, replace the Map below
 * with Redis (e.g. BullMQ job.progress()) and keep the same function
 * signatures so routes/video.js doesn't need to change.
 */

const jobs = new Map();

function createJob({ type, source }) {
  const id = uuidv4();
  const job = {
    id,
    type, // "upload" | "link"
    source, // original filename or URL
    status: "queued", // queued | processing | done | error
    progress: 0, // 0-100
    filePath: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

module.exports = { createJob, updateJob, getJob };
