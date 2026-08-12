/**
 * Converts Whisper API "segments" (array of { start, end, text }) into
 * standard .srt subtitle file content.
 *
 * SRT format looks like:
 *   1
 *   00:00:00,000 --> 00:00:03,200
 *   Hello and welcome to this video.
 *
 *   2
 *   00:00:03,200 --> 00:00:06,800
 *   Today we're talking about...
 */

function formatTimestamp(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000);

  const pad = (n, len = 2) => String(n).padStart(len, "0");

  return `${pad(hrs)}:${pad(mins)}:${pad(secs)},${pad(ms, 3)}`;
}

function segmentsToSrt(segments) {
  return segments
    .map((seg, i) => {
      const index = i + 1;
      const start = formatTimestamp(seg.start);
      const end = formatTimestamp(seg.end);
      const text = seg.text.trim();
      return `${index}\n${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
}

module.exports = { segmentsToSrt, formatTimestamp };
