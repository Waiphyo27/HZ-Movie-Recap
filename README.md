# Video Input Module

Handles the first step of the recap pipeline: getting a video into the
system, either by **file upload** or by **link** (YouTube, Douyin,
Xiaohongshu/RedNote, TikTok, Instagram, etc — anything `yt-dlp` supports).

## Setup

```bash
npm install
cp .env.example .env

# yt-dlp must be installed separately (not an npm package):
# macOS:   brew install yt-dlp
# Linux:   sudo apt install yt-dlp   (or: pip install -U yt-dlp)
# Windows: winget install yt-dlp

# ffmpeg is required by yt-dlp for format merging/remuxing:
# macOS:   brew install ffmpeg
# Linux:   sudo apt install ffmpeg
```

## Run

```bash
npm run dev   # with nodemon, auto-restart
# or
npm start
```

Server runs on `http://localhost:4000` by default.

## API

### 1. Upload a file
```bash
curl -X POST http://localhost:4000/api/video/upload \
  -F "video=@/path/to/video.mp4"
```
→ `{ "jobId": "...", "status": "done" }`

### 2. Submit a link
```bash
curl -X POST http://localhost:4000/api/video/link \
  -H "Content-Type: application/json" \
  -d '{"url": "http://xhslink.com/o/9BZdLINoA5i"}'
```
→ `{ "jobId": "...", "status": "processing", "platform": "xiaohongshu" }`

### 3. Poll job status (frontend "Job Status" panel)
```bash
curl http://localhost:4000/api/video/status/<jobId>
```
→
```json
{
  "id": "...",
  "type": "link",
  "source": "http://xhslink.com/o/9BZdLINoA5i",
  "status": "processing",
  "progress": 15,
  "filePath": null,
  "error": null
}
```
Poll this every 1-2 seconds from the frontend until `status` is `"done"`
or `"error"` — this is exactly the pattern behind the screenshot's
"Recap Job — PROCESSING — 15%" indicator.

## Notes / things to swap out later

- **Job store is in-memory** (`src/services/jobStore.js`). Fine for local
  dev; replace with Redis + BullMQ once you add the job queue module so
  jobs survive restarts and scale across multiple server processes. Route
  handlers already talk to it through `createJob/updateJob/getJob`, so the
  swap won't touch `routes/video.js`.
- **Douyin / Xiaohongshu often block anonymous requests.** If downloads
  fail with "video unavailable" or similar, export cookies from a logged-in
  browser session (e.g. with a browser extension like "Get cookies.txt")
  and point `YT_DLP_COOKIES` in `.env` at that file.
- **Storage** is local disk (`./uploads`, `./downloads`) for now. Swap for
  S3/GCS when you deploy, since job workers may run on ephemeral machines.
- This module only gets the video onto disk — next steps (transcription,
  script gen, TTS, ffmpeg overlay render) are separate modules that read
  `job.filePath` as their input.
