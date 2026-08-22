const express = require("express");
const router = express.Router();

const {
  createLoginCode,
  verifyLoginCode,
  getSession,
  destroySession,
  isAllowed,
  normalizeEmail,
  SESSION_TTL_MS,
} = require("../services/authStore");
const { sendLoginCode } = require("../services/mailer");
const { readToken, COOKIE_NAME } = require("../middleware/requireAuth");

function isHttps(req) {
  return req.secure || (req.get("x-forwarded-proto") || "").split(",")[0].trim() === "https";
}

function setSessionCookie(res, req, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res, req) {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isHttps(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function describeDevice(req) {
  const ua = req.get("user-agent") || "";
  if (/iPhone|iPad/i.test(ua)) return "iPhone / iPad";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux PC";
  return "Unknown device";
}

router.post("/request-code", async (req, res) => {
  const email = normalizeEmail((req.body || {}).email);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  // Do not reveal whether an address is on the allow-list.
  if (!isAllowed(email)) {
    return res.json({ ok: true, message: "If that address has access, a code is on the way." });
  }

  const result = createLoginCode(email);
  if (result.error === "rate_limited") {
    const minutes = Math.max(1, Math.ceil(result.waitMs / 60000));
    return res.status(429).json({ error: `Too many codes requested. Try again in ${minutes} minute(s).` });
  }

  try {
    await sendLoginCode(email, result.code, result.expiresInMinutes);
  } catch (err) {
    console.error("Failed to send login code:", err.message);
    return res.status(500).json({ error: "Could not send the email. Check the server email settings." });
  }

  return res.json({ ok: true, message: "If that address has access, a code is on the way." });
});

router.post("/verify", (req, res) => {
  const { email, code } = req.body || {};
  const normalized = normalizeEmail(email);

  if (!normalized || !code) {
    return res.status(400).json({ error: "Email and code are both required." });
  }
  if (!isAllowed(normalized)) {
    return res.status(403).json({ error: "That code is not valid." });
  }

  const result = verifyLoginCode(normalized, code, {
    device: describeDevice(req),
    ip: req.ip,
  });

  if (result.error === "no_code") {
    return res.status(400).json({ error: "No code was requested, or it expired. Request a new one." });
  }
  if (result.error === "too_many_attempts") {
    return res.status(429).json({ error: "Too many wrong attempts. Request a new code." });
  }
  if (result.error === "bad_code") {
    return res.status(400).json({ error: `Incorrect code. ${result.attemptsLeft} attempt(s) left.` });
  }

  setSessionCookie(res, req, result.token);
  return res.json({
    ok: true,
    email: normalized,
    replacedDevice: result.replacedDevice,
  });
});

router.get("/me", (req, res) => {
  const session = getSession(readToken(req));
  if (!session) return res.status(401).json({ error: "Not signed in." });
  return res.json({ email: session.email, device: session.device, since: session.createdAt });
});

router.post("/logout", (req, res) => {
  destroySession(readToken(req));
  clearSessionCookie(res, req);
  return res.json({ ok: true });
});

module.exports = router;
