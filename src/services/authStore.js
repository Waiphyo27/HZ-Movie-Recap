const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = process.env.DATA_DIR || "./data";
const STORE_PATH = path.join(DATA_DIR, "auth.json");

const CODE_TTL_MS = 10 * 60 * 1000;        // login code valid for 10 minutes
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // stay signed in for 30 days
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODE_REQUESTS = 3;               // per email, per window
const REQUEST_WINDOW_MS = 10 * 60 * 1000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function emptyStore() {
  return { sessions: {}, codes: {}, requests: {} };
}

function load() {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      sessions: parsed.sessions || {},
      codes: parsed.codes || {},
      requests: parsed.requests || {},
    };
  } catch (e) {
    return emptyStore();
  }
}

function save(store) {
  const tmp = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmp, STORE_PATH);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function allowedEmails() {
  return String(process.env.AUTH_ALLOWED_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);
}

function isAllowed(email) {
  const list = allowedEmails();
  if (list.length === 0) return false;
  return list.includes(normalizeEmail(email));
}

function hashCode(email, code) {
  return crypto.createHash("sha256").update(`${normalizeEmail(email)}:${code}`).digest("hex");
}

function prune(store, now) {
  for (const [token, s] of Object.entries(store.sessions)) {
    if (!s || s.expiresAt <= now) delete store.sessions[token];
  }
  for (const [email, c] of Object.entries(store.codes)) {
    if (!c || c.expiresAt <= now) delete store.codes[email];
  }
  for (const [email, r] of Object.entries(store.requests)) {
    if (!r || r.windowStart + REQUEST_WINDOW_MS <= now) delete store.requests[email];
  }
}

// Returns { code } on success, or { error } when rate limited.
function createLoginCode(email, now = Date.now()) {
  const store = load();
  prune(store, now);

  const key = normalizeEmail(email);
  const req = store.requests[key];
  if (req && req.windowStart + REQUEST_WINDOW_MS > now) {
    if (req.count >= MAX_CODE_REQUESTS) {
      const waitMs = req.windowStart + REQUEST_WINDOW_MS - now;
      save(store);
      return { error: "rate_limited", waitMs };
    }
    req.count += 1;
  } else {
    store.requests[key] = { windowStart: now, count: 1 };
  }

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  store.codes[key] = {
    hash: hashCode(key, code),
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
  };
  save(store);
  return { code, expiresInMinutes: Math.round(CODE_TTL_MS / 60000) };
}

// Returns { token, expiresAt } on success, or { error }.
// One device per email: every previous session for this email is removed.
function verifyLoginCode(email, code, meta = {}, now = Date.now()) {
  const store = load();
  prune(store, now);

  const key = normalizeEmail(email);
  const entry = store.codes[key];
  if (!entry) {
    save(store);
    return { error: "no_code" };
  }
  if (entry.attempts >= MAX_CODE_ATTEMPTS) {
    delete store.codes[key];
    save(store);
    return { error: "too_many_attempts" };
  }

  const supplied = hashCode(key, String(code || "").trim());
  const expected = entry.hash;
  const ok =
    supplied.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));

  if (!ok) {
    entry.attempts += 1;
    save(store);
    return { error: "bad_code", attemptsLeft: MAX_CODE_ATTEMPTS - entry.attempts };
  }

  delete store.codes[key];
  delete store.requests[key];

  let replacedDevice = null;
  for (const [token, s] of Object.entries(store.sessions)) {
    if (s && normalizeEmail(s.email) === key) {
      replacedDevice = s.device || null;
      delete store.sessions[token];
    }
  }

  const token = crypto.randomBytes(32).toString("hex");
  store.sessions[token] = {
    email: key,
    createdAt: now,
    lastSeen: now,
    expiresAt: now + SESSION_TTL_MS,
    device: meta.device || "unknown device",
    ip: meta.ip || null,
  };
  save(store);
  return { token, expiresAt: now + SESSION_TTL_MS, replacedDevice };
}

function getSession(token, now = Date.now()) {
  if (!token) return null;
  const store = load();
  const s = store.sessions[token];
  if (!s || s.expiresAt <= now) return null;
  if (!isAllowed(s.email)) return null; // removed from the allow-list -> access revoked
  if (now - (s.lastSeen || 0) > 60 * 1000) {
    s.lastSeen = now;
    save(store);
  }
  return s;
}

function destroySession(token) {
  if (!token) return;
  const store = load();
  if (store.sessions[token]) {
    delete store.sessions[token];
    save(store);
  }
}

module.exports = {
  createLoginCode,
  verifyLoginCode,
  getSession,
  destroySession,
  isAllowed,
  allowedEmails,
  normalizeEmail,
  SESSION_TTL_MS,
};
