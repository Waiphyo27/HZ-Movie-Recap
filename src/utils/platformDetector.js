/**
 * Detects which platform a video URL belongs to.
 * Used for: choosing yt-dlp extractor args, showing platform icon in UI,
 * and applying platform-specific quirks (e.g. Douyin/Xiaohongshu often need
 * a mobile user-agent or cookies to avoid bot-detection walls).
 */

const PLATFORM_PATTERNS = [
  { id: "youtube", label: "YouTube", regex: /(youtube\.com|youtu\.be)/i },
  { id: "douyin", label: "Douyin", regex: /(douyin\.com|v\.douyin\.com)/i },
  {
    id: "xiaohongshu",
    label: "Xiaohongshu / RedNote",
    regex: /(xiaohongshu\.com|xhslink\.com)/i,
  },
  { id: "tiktok", label: "TikTok", regex: /(tiktok\.com)/i },
  { id: "instagram", label: "Instagram", regex: /(instagram\.com)/i },
  { id: "facebook", label: "Facebook", regex: /(facebook\.com|fb\.watch)/i,},
  { id: "twitter", label: "Twitter / X", regex: /(twitter\.com|x\.com)/i },
  { id: "bilibili", label: "Bilibili", regex: /(bilibili\.com|b23\.tv)/i },
];

function detectPlatform(url) {
  const match = PLATFORM_PATTERNS.find((p) => p.regex.test(url));
  return match || { id: "generic", label: "Generic (yt-dlp supported)" };
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

module.exports = { detectPlatform, isValidUrl, PLATFORM_PATTERNS };
