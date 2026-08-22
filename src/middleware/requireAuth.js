const { getSession } = require("../services/authStore");

const COOKIE_NAME = "hz_session";

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function readToken(req) {
  return parseCookies(req)[COOKIE_NAME] || null;
}

function requireAuth(req, res, next) {
  const session = getSession(readToken(req));
  if (session) {
    req.user = { email: session.email };
    return next();
  }

  // API calls get a clean 401 so the front-end can react; page loads get redirected.
  if (req.path.startsWith("/api/") || req.xhr || (req.get("accept") || "").includes("application/json")) {
    return res.status(401).json({ error: "Not signed in.", loginUrl: "/login.html" });
  }
  return res.redirect("/login.html");
}

module.exports = { requireAuth, readToken, parseCookies, COOKIE_NAME };
