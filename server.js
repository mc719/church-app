// ===============================
// 1) IMPORTS
// ===============================
const express = require("express");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cors = require("cors");
const helmet = require("helmet");
require("dotenv").config();

// ===============================
// 2) CREATE APP
// ===============================
const app = express();
const PORT = process.env.PORT || 5050;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && (!process.env.JWT_SECRET || !process.env.DATABASE_URL)) {
  throw new Error("Missing required environment variables in production");
}

// ===============================
// 3) GLOBAL MIDDLEWARE
// ===============================
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.disable("x-powered-by");
app.set("trust proxy", 1);

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.length === 0) return true;
  return allowedOrigins.includes(origin);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true
  })
);

app.use("/api", (req, res, next) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({ error: "CORS origin blocked" });
  }
  next();
});

app.use("/api", (req, res, next) => {
  res.on("finish", () => {
    const status = res.statusCode;
    if (status !== 403 && status < 500) return;
    const minuteKey = `${status}:${new Date().toISOString().slice(0, 16)}`;
    const nextCount = (apiStatusWindow.get(minuteKey) || 0) + 1;
    apiStatusWindow.set(minuteKey, nextCount);
    const threshold = status === 403 ? 30 : 10;
    if (nextCount === threshold) {
      console.warn(
        "[SECURITY] API status spike",
        JSON.stringify({ status, count: nextCount, windowMinute: minuteKey, path: req.originalUrl })
      );
    }
  });
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use("/old", (req, res) => {
  res.status(404).send("Not found");
});
app.use(express.static("public"));
const clientDistPath = path.join(__dirname, "client", "dist");
app.use("/", express.static(clientDistPath));

// ===============================
// 4) DATABASE CONNECTION
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_DAYS = 14;
const COOKIE_SECURE = isProduction;

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return raw.split(";").reduce((acc, part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return acc;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (key) acc[key] = value;
    return acc;
  }, {});
}

function setAuthCookies(res, accessToken, refreshToken) {
  const base = ["Path=/", "HttpOnly", "SameSite=Lax"];
  if (COOKIE_SECURE) base.push("Secure");
  const accessCookie = [
    `access_token=${encodeURIComponent(accessToken)}`,
    ...base,
    `Max-Age=${ACCESS_TOKEN_TTL_SEC}`
  ].join("; ");
  const refreshCookie = [
    `refresh_token=${encodeURIComponent(refreshToken)}`,
    ...base,
    `Max-Age=${REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60}`
  ].join("; ");
  res.setHeader("Set-Cookie", [accessCookie, refreshCookie]);
}

function clearAuthCookies(res) {
  const base = ["Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (COOKIE_SECURE) base.push("Secure");
  res.setHeader("Set-Cookie", [
    `access_token=; ${base.join("; ")}`,
    `refresh_token=; ${base.join("; ")}`
  ]);
}

// ===============================
// 4.5) ONE-TIME CODE (OTP) STORE
// ===============================
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const otpStore = new Map(); // email -> { code, expiresAt, user }

function isExpired(ts) {
  return !ts || Date.now() > ts;
}

function toBooleanOrNull(value) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "yes" || normalized === "true") return true;
    if (normalized === "no" || normalized === "false") return false;
  }
  return null;
}

function toTextArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function parseMonthDay(value) {
  if (!value) return { month: null, day: null };
  const text = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const mmdd = /^(\d{2})-(\d{2})$/;
  const dmy = /^(\d{2})\/(\d{2})$/;

  let month;
  let day;
  if (iso.test(text)) {
    const m = text.match(iso);
    month = Number(m[2]);
    day = Number(m[3]);
  } else if (mmdd.test(text)) {
    const m = text.match(mmdd);
    month = Number(m[1]);
    day = Number(m[2]);
  } else if (dmy.test(text)) {
    const m = text.match(dmy);
    day = Number(m[1]);
    month = Number(m[2]);
  } else {
    return { month: null, day: null };
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { month: null, day: null };
  }
  return { month, day };
}

function monthDayString(month, day) {
  if (!month || !day) return null;
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ===============================
// 5) AUTH MIDDLEWARE (PASTE HERE)
// ===============================
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";
const ACCESS_CODE = process.env.ACCESS_CODE || "";

function normalizeAccessCode(code) {
  return String(code || "").trim();
}

function getBearerOrCookieToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  const cookies = parseCookies(req);
  return cookies.access_token || null;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      username: user.username,
      tokenVersion: Number(user.token_version || user.tokenVersion || 1)
    },
    JWT_SECRET,
    { expiresIn: `${ACCESS_TOKEN_TTL_SEC}s` }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function storeRefreshToken({ userId, token, req, expiresAt = null, replacedBy = null }) {
  const effectiveExpiry =
    expiresAt ||
    new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_ip, user_agent, replaced_by_token_hash)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [userId, hashToken(token), effectiveExpiry, req.ip || null, req.headers["user-agent"] || null, replacedBy ? hashToken(replacedBy) : null]
  );
}

async function revokeRefreshTokenByRaw(rawToken, reason = "revoked") {
  if (!rawToken) return;
  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = NOW(), revoke_reason = COALESCE(revoke_reason, $2)
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(rawToken), reason]
  );
}

async function issueAuthSession({ user, req, res, previousRefreshToken = null }) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken({ userId: user.id, token: refreshToken, req, replacedBy: previousRefreshToken || null });
  if (previousRefreshToken) {
    await revokeRefreshTokenByRaw(previousRefreshToken, "rotated");
  }
  setAuthCookies(res, accessToken, refreshToken);
  return { accessToken, refreshToken };
}

function requireAuth(req, res, next) {
  const token = getBearerOrCookieToken(req);

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  pool
    .query(
      "SELECT id, username, role, status, token_version FROM users WHERE id = $1 LIMIT 1",
      [payload.userId]
    )
    .then((result) => {
      const user = result.rows[0];
      if (!user) {
        return res.status(401).json({ error: "Invalid token user" });
      }
      if (!user.status) {
        return res.status(403).json({ error: "Account disabled" });
      }
      const tokenVersion = Number(payload.tokenVersion);
      const currentVersion = Number(user.token_version || 1);
      if (!Number.isFinite(tokenVersion) || tokenVersion !== currentVersion) {
        return res.status(401).json({ error: "Session expired. Please sign in again." });
      }
      req.user = {
        userId: String(user.id),
        username: user.username,
        role: user.role,
        tokenVersion: currentVersion
      };
      next();
    })
    .catch((err) => {
      console.error("Auth check failed:", err);
      return res.status(500).json({ error: "Auth validation failed" });
    });
}

function requireAuthOrAccessCode(req, res, next) {
  const token = getBearerOrCookieToken(req);
  const accessCode = normalizeAccessCode(req.headers["x-access-code"]);
  const expectedAccessCode = normalizeAccessCode(ACCESS_CODE);

  if (expectedAccessCode && accessCode && accessCode === expectedAccessCode) {
    return next();
  }

  if (!token) {
    return res.status(401).json({ error: expectedAccessCode ? "Missing token or access code" : "Missing token" });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  pool
    .query(
      "SELECT id, username, role, status, token_version FROM users WHERE id = $1 LIMIT 1",
      [payload.userId]
    )
    .then((result) => {
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: "Invalid token user" });
      if (!user.status) return res.status(403).json({ error: "Account disabled" });
      const tokenVersion = Number(payload.tokenVersion);
      const currentVersion = Number(user.token_version || 1);
      if (!Number.isFinite(tokenVersion) || tokenVersion !== currentVersion) {
        return res.status(401).json({ error: "Session expired. Please sign in again." });
      }
      req.user = {
        userId: String(user.id),
        username: user.username,
        role: user.role,
        tokenVersion: currentVersion
      };
      next();
    })
    .catch((err) => {
      console.error("Auth check failed:", err);
      return res.status(500).json({ error: "Auth validation failed" });
    });
}

app.post("/api/access/verify", rateLimit({ keyPrefix: "access-verify", windowMs: 60_000, max: 10 }), (req, res) => {
  const accessCode = normalizeAccessCode(req.body?.accessCode);
  const expectedAccessCode = normalizeAccessCode(ACCESS_CODE);
  if (!expectedAccessCode) {
    return res.status(403).json({ error: "Access code not configured" });
  }
  if (!accessCode) {
    return res.status(400).json({ error: "Access code required" });
  }
  if (accessCode !== expectedAccessCode) {
    return res.status(401).json({ error: "Invalid access code" });
  }
  res.json({ ok: true });
});

const rateLimitStore = new Map();
const apiStatusWindow = new Map();

function rateLimit({ keyPrefix, windowMs, max }) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }
    entry.count += 1;
    rateLimitStore.set(key, entry);
    if (entry.count > max) {
      return res.status(429).json({ error: "Too many requests. Try again later." });
    }
    next();
  };
}

function loginAttemptKey(req, username) {
  const ip = req.ip || "unknown-ip";
  return `login-attempt:${ip}:${String(username || "").trim().toLowerCase()}`;
}

async function isLoginLocked(req, username) {
  const key = loginAttemptKey(req, username);
  const result = await pool.query(
    `SELECT lock_until
     FROM login_attempts
     WHERE attempt_key = $1
     LIMIT 1`,
    [key]
  );
  if (!result.rows.length) return false;
  const lockUntil = result.rows[0].lock_until ? new Date(result.rows[0].lock_until).getTime() : 0;
  return lockUntil > Date.now();
}

async function recordLoginFailure(req, username) {
  const key = loginAttemptKey(req, username);
  const existing = await pool.query(
    `SELECT fail_count
     FROM login_attempts
     WHERE attempt_key = $1
     LIMIT 1`,
    [key]
  );
  const nextCount = Number(existing.rows[0]?.fail_count || 0) + 1;
  const lockUntil = nextCount >= 8 ? new Date(Date.now() + 15 * 60 * 1000) : null;
  await pool.query(
    `INSERT INTO login_attempts (attempt_key, fail_count, lock_until, updated_at)
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT (attempt_key) DO UPDATE
       SET fail_count = EXCLUDED.fail_count,
           lock_until = EXCLUDED.lock_until,
           updated_at = NOW()`,
    [key, nextCount, lockUntil]
  );
  if (lockUntil) {
    console.warn("[SECURITY] Login lockout triggered", JSON.stringify({ ip: req.ip, username: String(username || "").trim().toLowerCase() }));
  }
}

async function clearLoginFailures(req, username) {
  const key = loginAttemptKey(req, username);
  await pool.query("DELETE FROM login_attempts WHERE attempt_key = $1", [key]);
}

function safeString(value, maxLen = 255) {
  return String(value || "").trim().slice(0, maxLen);
}

function validateDataUrlImage(dataUrl, maxBytes = 2 * 1024 * 1024) {
  if (dataUrl == null || dataUrl === "") {
    return { ok: true };
  }
  const value = String(dataUrl).trim();
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    return { ok: false, error: "Invalid image format. Allowed: png, jpg/jpeg, webp" };
  }
  const base64Payload = match[2];
  const bytes = Buffer.byteLength(base64Payload, "base64");
  if (bytes > maxBytes) {
    return { ok: false, error: "Image too large (max 2MB)" };
  }
  return { ok: true, bytes };
}

function isValidEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

async function logAuditEvent({
  actorUserId = null,
  actorRole = null,
  action = "",
  targetType = null,
  targetId = null,
  outcome = "success",
  req = null,
  meta = null
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (
         actor_user_id, actor_role, action, target_type, target_id, outcome, ip_address, user_agent, metadata
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        actorUserId,
        actorRole,
        action,
        targetType,
        targetId,
        outcome,
        req?.ip || null,
        req?.headers?.["user-agent"] || null,
        meta ? JSON.stringify(meta) : null
      ]
    );
  } catch (err) {
    console.error("Audit log write failed:", err.message);
  }
}

function isValidGender(value) {
  if (!value) return true;
  const allowed = new Set(["male", "female", "unknown"]);
  return allowed.has(String(value).trim().toLowerCase());
}

function validateWritePayload(req, res, allowedKeys) {
  const body = req.body || {};
  const keys = Object.keys(body);
  const unknown = keys.filter((key) => !allowedKeys.includes(key));
  if (unknown.length) {
    res.status(400).json({ error: `Unknown field(s): ${unknown.join(", ")}` });
    return false;
  }
  return true;
}

const NOTIFICATION_TARGETING_KEY = "notification_targeting_config";
const DEFAULT_NOTIFICATION_TARGETING_CONFIG = {
  enableRoleTargeting: true,
  enableUsernameTargeting: true,
  allowedRoles: []
};

function normalizeNotificationTargetingConfig(value) {
  const source = value && typeof value === "object" ? value : {};
  const enableRoleTargeting =
    typeof source.enableRoleTargeting === "boolean"
      ? source.enableRoleTargeting
      : DEFAULT_NOTIFICATION_TARGETING_CONFIG.enableRoleTargeting;
  const enableUsernameTargeting =
    typeof source.enableUsernameTargeting === "boolean"
      ? source.enableUsernameTargeting
      : DEFAULT_NOTIFICATION_TARGETING_CONFIG.enableUsernameTargeting;
  const allowedRoles = Array.isArray(source.allowedRoles)
    ? Array.from(new Set(source.allowedRoles.map((role) => safeString(role, 80)).filter(Boolean)))
    : [];
  return {
    enableRoleTargeting,
    enableUsernameTargeting,
    allowedRoles
  };
}

async function getNotificationTargetingConfig() {
  const result = await pool.query(
    "SELECT value FROM app_settings WHERE key = $1 LIMIT 1",
    [NOTIFICATION_TARGETING_KEY]
  );
  if (!result.rows.length || !result.rows[0].value) {
    return { ...DEFAULT_NOTIFICATION_TARGETING_CONFIG };
  }
  try {
    const parsed = JSON.parse(result.rows[0].value);
    return normalizeNotificationTargetingConfig(parsed);
  } catch {
    return { ...DEFAULT_NOTIFICATION_TARGETING_CONFIG };
  }
}

async function saveNotificationTargetingConfig(config) {
  const normalized = normalizeNotificationTargetingConfig(config);
  await pool.query(
    `INSERT INTO app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [NOTIFICATION_TARGETING_KEY, JSON.stringify(normalized)]
  );
  return normalized;
}

function normalizeAttendeesInput(value) {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          try {
            return JSON.parse(item);
          } catch {
            return null;
          }
        }
        return item;
      })
      .filter(Boolean)
      .map((item) => ({
        memberId: String(item.memberId || item.id || "").trim(),
        name: safeString(item.name, 160),
        present: item.present === true
      }));
  }
  return [];
}

const allowedMeetingTypes = new Set([
  "prayer and planning",
  "bible study 1",
  "bible study 2",
  "outreach meeting"
]);

function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== "superuser" && role !== "admin") {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}

function isStaffRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return (
    normalized === "superuser" ||
    normalized === "admin" ||
    normalized === "cell leader" ||
    normalized === "cell-leader"
  );
}

function requireStaff(req, res, next) {
  if (!isStaffRole(req.user?.role)) {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}

app.use("/api", (req, res, next) => {
  const method = req.method.toUpperCase();
  const isWrite = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (!isWrite) return next();

  const startedAt = Date.now();
  res.on("finish", () => {
    const entry = {
      method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      userId: req.user?.userId || null,
      role: req.user?.role || null,
      ip: req.ip
    };
    console.info("[AUDIT]", JSON.stringify(entry));
  });
  next();
});

async function createSession(userId, req) {
  const ipAddress = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString();
  const userAgent = (req.headers["user-agent"] || "").toString();
  const result = await pool.query(
    `INSERT INTO sessions (user_id, login_time, last_activity, ip_address, user_agent, idle_ms, active_ms)
     VALUES ($1, NOW(), NOW(), $2, $3, 0, 0)
     RETURNING id::text as id`,
    [userId, ipAddress, userAgent]
  );
  return result.rows[0]?.id || null;
}

async function createNotification({ title, message, type = "info", userId = null }) {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1,$2,$3,$4)
     RETURNING id::text as id,
               user_id::text as "userId",
               title,
               message,
               type,
               created_at as "createdAt",
               read_at as "readAt"`,
    [userId, title, message, type]
  );
  return result.rows[0];
}

  async function ensureFirstTimerSchema() {
    await pool.query(
      `ALTER TABLE first_timers
          ADD COLUMN IF NOT EXISTS title TEXT,
          ADD COLUMN IF NOT EXISTS surname TEXT,
                ADD COLUMN IF NOT EXISTS gender TEXT,
         ADD COLUMN IF NOT EXISTS address TEXT,
         ADD COLUMN IF NOT EXISTS postcode TEXT,
         ADD COLUMN IF NOT EXISTS email TEXT,
         ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS photo_data TEXT,
         ADD COLUMN IF NOT EXISTS birthday_month SMALLINT,
         ADD COLUMN IF NOT EXISTS birthday_day SMALLINT,
         ADD COLUMN IF NOT EXISTS age_group TEXT,
         ADD COLUMN IF NOT EXISTS marital_status TEXT,
       ADD COLUMN IF NOT EXISTS born_again BOOLEAN,
       ADD COLUMN IF NOT EXISTS speak_tongues BOOLEAN,
       ADD COLUMN IF NOT EXISTS find_out JSONB DEFAULT '[]'::jsonb,
       ADD COLUMN IF NOT EXISTS contact_pref JSONB DEFAULT '[]'::jsonb,
       ADD COLUMN IF NOT EXISTS visit BOOLEAN,
       ADD COLUMN IF NOT EXISTS visit_when TEXT,
       ADD COLUMN IF NOT EXISTS prayer_requests JSONB DEFAULT '[]'::jsonb,
       ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
       ADD COLUMN IF NOT EXISTS in_foundation_school BOOLEAN NOT NULL DEFAULT FALSE,
       ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
       ADD COLUMN IF NOT EXISTS invited_by TEXT,
       ADD COLUMN IF NOT EXISTS foundation_tracking JSONB DEFAULT '{}'::jsonb,
       ADD COLUMN IF NOT EXISTS foundation_class TEXT,
       ADD COLUMN IF NOT EXISTS exam_status TEXT,
       ADD COLUMN IF NOT EXISTS graduation_date DATE,
       ADD COLUMN IF NOT EXISTS graduated_year INTEGER,
       ADD COLUMN IF NOT EXISTS is_graduate BOOLEAN NOT NULL DEFAULT FALSE`
  );

  await pool.query(
    `ALTER TABLE members
       ADD COLUMN IF NOT EXISTS dob_month SMALLINT,
       ADD COLUMN IF NOT EXISTS dob_day SMALLINT`
  );

  await pool.query(
    `ALTER TABLE members
       ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL`
  );

  await pool.query(
    `ALTER TABLE members
       ADD COLUMN IF NOT EXISTS foundation_school BOOLEAN NOT NULL DEFAULT FALSE`
  );

  await pool.query(
    `UPDATE members
     SET dob_month = EXTRACT(MONTH FROM date_of_birth)::smallint,
         dob_day = EXTRACT(DAY FROM date_of_birth)::smallint
     WHERE date_of_birth IS NOT NULL
       AND (dob_month IS NULL OR dob_day IS NULL)`
  );
}

async function ensureUserProfilesSchema() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS departments (
       id SERIAL PRIMARY KEY,
       name TEXT UNIQUE NOT NULL,
       hod_title TEXT,
       hod_name TEXT,
       hod_mobile TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_profiles (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
       email TEXT NOT NULL,
       username TEXT,
       full_name TEXT,
       phone TEXT,
       role_title TEXT,
       title TEXT,
       cell_id INTEGER REFERENCES cells(id) ON DELETE SET NULL,
       postcode TEXT,
       department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
       dob_month SMALLINT,
       dob_day SMALLINT,
       address TEXT,
       photo_data TEXT,
       source TEXT DEFAULT 'system',
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  );

  await pool.query(
    `ALTER TABLE user_profiles
       ADD COLUMN IF NOT EXISTS username TEXT,
       ADD COLUMN IF NOT EXISTS full_name TEXT,
       ADD COLUMN IF NOT EXISTS phone TEXT,
       ADD COLUMN IF NOT EXISTS role_title TEXT,
       ADD COLUMN IF NOT EXISTS title TEXT,
       ADD COLUMN IF NOT EXISTS cell_id INTEGER REFERENCES cells(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS postcode TEXT,
       ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS dob_month SMALLINT,
       ADD COLUMN IF NOT EXISTS dob_day SMALLINT,
       ADD COLUMN IF NOT EXISTS address TEXT,
       ADD COLUMN IF NOT EXISTS photo_data TEXT,
       ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'system',
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  );

  await pool.query(
    `ALTER TABLE departments
       ADD COLUMN IF NOT EXISTS hod_title TEXT`
  );

  await pool.query(
    `ALTER TABLE members
       ADD COLUMN IF NOT EXISTS address TEXT,
       ADD COLUMN IF NOT EXISTS postcode TEXT`
  );

  await pool.query(
    `ALTER TABLE users
       ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1`
  );
}

async function ensureSecuritySchema() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
       id BIGSERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       token_hash TEXT NOT NULL UNIQUE,
       expires_at TIMESTAMP NOT NULL,
       revoked_at TIMESTAMP,
       revoke_reason TEXT,
       created_ip TEXT,
       user_agent TEXT,
       replaced_by_token_hash TEXT,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id)`
  );

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at)`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS login_attempts (
       attempt_key TEXT PRIMARY KEY,
       fail_count INTEGER NOT NULL DEFAULT 0,
       lock_until TIMESTAMP,
       updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );

  await pool.query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
       id BIGSERIAL PRIMARY KEY,
       actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       actor_role TEXT,
       action TEXT NOT NULL,
       target_type TEXT,
       target_id TEXT,
       outcome TEXT NOT NULL DEFAULT 'success',
       ip_address TEXT,
       user_agent TEXT,
       metadata JSONB,
       created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`
  );

  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`
  );

  await pool.query(
    `DELETE FROM login_attempts
     WHERE lock_until IS NOT NULL
       AND lock_until < NOW() - INTERVAL '1 day'`
  );

  await pool.query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < NOW() - INTERVAL '7 days'`
  );
}

async function ensureUserProfileForUser({ userId, email, username = null, role = null }) {
  if (!userId || !email) return;
  await pool.query(
    `INSERT INTO user_profiles (user_id, email, username, role_title, source, updated_at)
     VALUES ($1,$2,$3,$4,'system', NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET email = EXCLUDED.email,
           username = COALESCE(EXCLUDED.username, user_profiles.username),
           role_title = COALESCE(EXCLUDED.role_title, user_profiles.role_title),
           updated_at = NOW()`,
    [userId, email, username, role]
  );
}

async function syncProfileByEmail({ email, fullName = null, phone = null, roleTitle = null, cellId = null, departmentId = null, dobMonth = null, dobDay = null, address = null, source = "member-sync" }) {
  if (!email) return;
  const normalized = String(email).trim().toLowerCase();
  const userResult = await pool.query(
    "SELECT id, username, role FROM users WHERE LOWER(email) = $1 LIMIT 1",
    [normalized]
  );
  const user = userResult.rows[0];
  if (!user?.id) return;

  await ensureUserProfileForUser({
    userId: user.id,
    email: normalized,
    username: user.username,
    role: user.role
  });

  await pool.query(
    `UPDATE user_profiles
     SET full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone),
         role_title = COALESCE($3, role_title),
         cell_id = COALESCE($4, cell_id),
         department_id = COALESCE($5, department_id),
         dob_month = COALESCE($6, dob_month),
         dob_day = COALESCE($7, dob_day),
         address = COALESCE($8, address),
         source = COALESCE($9, source),
         updated_at = NOW()
     WHERE user_id = $10`,
    [fullName, phone, roleTitle, cellId, departmentId, dobMonth, dobDay, address, source, user.id]
  );
}

async function seedProfilesForExistingUsers() {
  const users = await pool.query("SELECT id, username, email, role FROM users WHERE email IS NOT NULL");
  for (const user of users.rows) {
    await ensureUserProfileForUser({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role
    });
  }
}

async function refreshProfileFromEmail(userId) {
  const userResult = await pool.query(
    "SELECT id, username, email, role FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const user = userResult.rows[0];
  if (!user?.email) return;

  await ensureUserProfileForUser({
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role
  });

  const normalizedEmail = String(user.email).trim().toLowerCase();

  const memberResult = await pool.query(
    `SELECT title, name, mobile, role, cell_id, dob_month, dob_day, address, postcode
     FROM members
     WHERE LOWER(email) = $1
     ORDER BY joined_date DESC NULLS LAST, id DESC
     LIMIT 1`,
    [normalizedEmail]
  );

  if (memberResult.rows.length) {
    const member = memberResult.rows[0];
    await pool.query(
      `UPDATE user_profiles
       SET title = COALESCE($1, title),
           full_name = COALESCE($2, full_name),
           phone = COALESCE($3, phone),
           role_title = COALESCE($4, role_title),
           cell_id = COALESCE($5, cell_id),
           dob_month = COALESCE($6, dob_month),
           dob_day = COALESCE($7, dob_day),
           address = COALESCE($8, address),
           postcode = COALESCE($9, postcode),
           source = 'email-sync',
           updated_at = NOW()
       WHERE user_id = $10`,
      [member.title, member.name, member.mobile, member.role, member.cell_id, member.dob_month, member.dob_day, member.address, member.postcode, user.id]
    );
    return;
  }

  const firstTimerResult = await pool.query(
    `SELECT name, surname, mobile, cell_id, birthday_month, birthday_day, address, postcode
     FROM first_timers
     WHERE LOWER(email) = $1
     ORDER BY date_joined DESC NULLS LAST, id DESC
     LIMIT 1`,
    [normalizedEmail]
  );

  if (firstTimerResult.rows.length) {
    const ft = firstTimerResult.rows[0];
    await pool.query(
      `UPDATE user_profiles
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           role_title = COALESCE($3, role_title),
           cell_id = COALESCE($4, cell_id),
           dob_month = COALESCE($5, dob_month),
           dob_day = COALESCE($6, dob_day),
           address = COALESCE($7, address),
           postcode = COALESCE($8, postcode),
           source = 'email-sync',
           updated_at = NOW()
       WHERE user_id = $9`,
      [[ft.name, ft.surname].filter(Boolean).join(" ").trim() || ft.name, ft.mobile, "First-Timer", ft.cell_id, ft.birthday_month, ft.birthday_day, ft.address, ft.postcode, user.id]
    );
  }
}

async function getProfileView(userId) {
  const result = await pool.query(
    `SELECT up.id::text as id,
            up.user_id::text as "userId",
            up.email,
            up.username,
            up.title,
            up.full_name as "fullName",
            up.phone,
            up.role_title as "roleTitle",
            up.cell_id::text as "cellId",
            c.name as "cellName",
            c.venue as "cellVenue",
            COALESCE(
              (
                SELECT m.name
                FROM members m
                WHERE m.cell_id = up.cell_id AND LOWER(m.role) = 'cell leader'
                ORDER BY m.id
                LIMIT 1
              ),
              ''
            ) as "cellLeader",
            COALESCE(
              (
                SELECT m.mobile
                FROM members m
                WHERE m.cell_id = up.cell_id AND LOWER(m.role) = 'cell leader'
                ORDER BY m.id
                LIMIT 1
              ),
              ''
            ) as "cellLeaderMobile",
            up.department_id::text as "departmentId",
            d.name as "departmentName",
            d.hod_name as "hodName",
            d.hod_mobile as "hodMobile",
            up.postcode,
            up.dob_month as "dobMonth",
            up.dob_day as "dobDay",
            CASE
              WHEN up.dob_month IS NOT NULL AND up.dob_day IS NOT NULL
                THEN LPAD(up.dob_month::text, 2, '0') || '-' || LPAD(up.dob_day::text, 2, '0')
              ELSE NULL
            END as "dateOfBirth",
            up.address,
            up.photo_data as "photoData",
            up.source,
            up.updated_at as "updatedAt"
     FROM user_profiles up
     LEFT JOIN cells c ON c.id = up.cell_id
     LEFT JOIN departments d ON d.id = up.department_id
     WHERE up.user_id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getProfileByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const userResult = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
    [normalizedEmail]
  );
  if (userResult.rows.length) {
    const userId = userResult.rows[0].id;
    await refreshProfileFromEmail(userId);
    return await getProfileView(userId);
  }

  const memberResult = await pool.query(
    `SELECT
        NULL::text as id,
        NULL::text as "userId",
        $1::text as email,
        NULL::text as username,
        m.title,
        m.name as "fullName",
        m.mobile as phone,
        m.role as "roleTitle",
        m.cell_id::text as "cellId",
        c.name as "cellName",
        c.venue as "cellVenue",
        COALESCE(
          (
            SELECT m2.name
            FROM members m2
            WHERE m2.cell_id = m.cell_id AND LOWER(m2.role) = 'cell leader'
            ORDER BY m2.id
            LIMIT 1
          ),
          ''
        ) as "cellLeader",
        COALESCE(
          (
            SELECT m2.mobile
            FROM members m2
            WHERE m2.cell_id = m.cell_id AND LOWER(m2.role) = 'cell leader'
            ORDER BY m2.id
            LIMIT 1
          ),
          ''
        ) as "cellLeaderMobile",
        NULL::text as "departmentId",
        NULL::text as "departmentName",
        NULL::text as "hodName",
        NULL::text as "hodMobile",
        m.postcode,
        m.dob_month as "dobMonth",
        m.dob_day as "dobDay",
        CASE
          WHEN m.dob_month IS NOT NULL AND m.dob_day IS NOT NULL
            THEN LPAD(m.dob_month::text, 2, '0') || '-' || LPAD(m.dob_day::text, 2, '0')
          ELSE NULL
        END as "dateOfBirth",
        m.address,
        NULL::text as "photoData",
        'email-member'::text as source,
        NOW() as "updatedAt"
     FROM members m
     LEFT JOIN cells c ON c.id = m.cell_id
     WHERE LOWER(m.email) = $1
     ORDER BY m.joined_date DESC NULLS LAST, m.id DESC
     LIMIT 1`,
    [normalizedEmail]
  );
  if (memberResult.rows.length) return memberResult.rows[0];

  const firstTimerResult = await pool.query(
    `SELECT
        NULL::text as id,
        NULL::text as "userId",
        $1::text as email,
        NULL::text as username,
        NULL::text as title,
        CONCAT_WS(' ', ft.name, ft.surname) as "fullName",
        ft.mobile as phone,
        'First-Timer'::text as "roleTitle",
        ft.cell_id::text as "cellId",
        c.name as "cellName",
        c.venue as "cellVenue",
        ''::text as "cellLeader",
        ''::text as "cellLeaderMobile",
        NULL::text as "departmentId",
        NULL::text as "departmentName",
        NULL::text as "hodName",
        NULL::text as "hodMobile",
        ft.postcode,
        ft.birthday_month as "dobMonth",
        ft.birthday_day as "dobDay",
        CASE
          WHEN ft.birthday_month IS NOT NULL AND ft.birthday_day IS NOT NULL
            THEN LPAD(ft.birthday_month::text, 2, '0') || '-' || LPAD(ft.birthday_day::text, 2, '0')
          ELSE NULL
        END as "dateOfBirth",
        ft.address,
        NULL::text as "photoData",
        'email-first-timer'::text as source,
        NOW() as "updatedAt"
     FROM first_timers ft
     LEFT JOIN cells c ON c.id = ft.cell_id
     WHERE LOWER(ft.email) = $1
     ORDER BY ft.date_joined DESC NULLS LAST, ft.id DESC
     LIMIT 1`,
    [normalizedEmail]
  );
  return firstTimerResult.rows[0] || null;
}

async function applyProfileUpdate(userId, payload = {}, source = "manual") {
  const {
    title,
    fullName,
    phone,
    roleTitle,
    cellId,
    dateOfBirth,
    address,
    postcode,
    photoData,
    email,
    cellName,
    cellVenue,
    cellLeader,
    cellLeaderMobile,
    departmentName,
    hodName,
    hodMobile
  } = payload;

  const parsedDob = parseMonthDay(dateOfBirth);
  const currentUser = await pool.query("SELECT id, email FROM users WHERE id = $1 LIMIT 1", [userId]);
  if (!currentUser.rows.length) {
    throw new Error("User not found");
  }
  const currentEmail = String(currentUser.rows[0].email || "").trim().toLowerCase();
  const newEmail = email ? String(email).trim().toLowerCase() : currentEmail;
  const targetCellId = cellId || null;

  // Update user/profile base record.
  await pool.query("UPDATE users SET email = $1 WHERE id = $2", [newEmail, userId]);

  let departmentId = null;
  if (departmentName && String(departmentName).trim()) {
    const dept = await pool.query(
      `INSERT INTO departments (name, hod_name, hod_mobile, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (name) DO UPDATE
         SET hod_name = COALESCE(EXCLUDED.hod_name, departments.hod_name),
             hod_mobile = COALESCE(EXCLUDED.hod_mobile, departments.hod_mobile),
             updated_at = NOW()
       RETURNING id`,
      [String(departmentName).trim(), hodName || null, hodMobile || null]
    );
    departmentId = dept.rows[0]?.id || null;
  }

  await pool.query(
    `UPDATE user_profiles
     SET email = COALESCE($1, email),
         title = COALESCE($2, title),
         full_name = COALESCE($3, full_name),
         phone = COALESCE($4, phone),
         role_title = COALESCE($5, role_title),
         cell_id = COALESCE($6, cell_id),
         department_id = COALESCE($7, department_id),
         dob_month = COALESCE($8, dob_month),
         dob_day = COALESCE($9, dob_day),
         address = COALESCE($10, address),
         postcode = COALESCE($11, postcode),
         photo_data = COALESCE($12, photo_data),
         source = COALESCE($13, source),
         updated_at = NOW()
     WHERE user_id = $14`,
    [newEmail, title ?? null, fullName ?? null, phone ?? null, roleTitle ?? null, targetCellId, departmentId, parsedDob.month, parsedDob.day, address ?? null, postcode ?? null, photoData ?? null, source, userId]
  );

  // Keep member/first-timer in sync by email.
  const emailCandidates = [currentEmail, newEmail].filter(Boolean);
  await pool.query(
    `UPDATE members
     SET title = COALESCE($1, title),
         name = COALESCE($2, name),
         mobile = COALESCE($3, mobile),
         email = COALESCE($4, email),
         role = COALESCE($5, role),
         cell_id = COALESCE($6, cell_id),
         dob_month = COALESCE($7, dob_month),
         dob_day = COALESCE($8, dob_day),
         address = COALESCE($9, address),
         postcode = COALESCE($10, postcode)
     WHERE LOWER(email) = ANY($11)`,
    [title ?? null, fullName ?? null, phone ?? null, newEmail ?? null, roleTitle ?? null, targetCellId, parsedDob.month, parsedDob.day, address ?? null, postcode ?? null, emailCandidates]
  );

  const profileName = fullName ? String(fullName).trim() : null;
  const [firstName, ...restName] = (profileName || "").split(" ");
  const surname = restName.join(" ").trim();
  await pool.query(
    `UPDATE first_timers
     SET name = COALESCE($1, name),
         surname = COALESCE(NULLIF($2, ''), surname),
         mobile = COALESCE($3, mobile),
         email = COALESCE($4, email),
         cell_id = COALESCE($5, cell_id),
         birthday_month = COALESCE($6, birthday_month),
         birthday_day = COALESCE($7, birthday_day),
         address = COALESCE($8, address),
         postcode = COALESCE($9, postcode)
     WHERE LOWER(email) = ANY($10)`,
    [firstName || null, surname || null, phone ?? null, newEmail ?? null, targetCellId, parsedDob.month, parsedDob.day, address ?? null, postcode ?? null, emailCandidates]
  );

  // Cell section edits.
  if (targetCellId && (cellName || cellVenue)) {
    await pool.query(
      `UPDATE cells
       SET name = COALESCE($1, name),
           venue = COALESCE($2, venue)
       WHERE id = $3`,
      [cellName ?? null, cellVenue ?? null, targetCellId]
    );
  }

  if (targetCellId && (cellLeader || cellLeaderMobile)) {
    const existingLeader = await pool.query(
      `SELECT id FROM members WHERE cell_id = $1 AND LOWER(role) = 'cell leader' ORDER BY id LIMIT 1`,
      [targetCellId]
    );
    if (existingLeader.rows.length) {
      await pool.query(
        `UPDATE members
         SET name = COALESCE($1, name),
             mobile = COALESCE($2, mobile)
         WHERE id = $3`,
        [cellLeader ?? null, cellLeaderMobile ?? null, existingLeader.rows[0].id]
      );
    }
  }
}

// ===============================
// 6) ROUTES
// ===============================

// Test route
// Health check (DB connectivity)
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: "connected", ts: new Date().toISOString() });
  } catch (err) {
    console.error("Health check failed:", err);
    res.status(500).json({ ok: false, db: "error" });
  }
});

// Public logo fetch
app.get("/api/settings/logo", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'logo_image' LIMIT 1"
    );
    res.json({ logo: result.rows[0]?.value || null });
  } catch (err) {
    console.error("Failed to load logo:", err);
    res.status(500).json({ error: "Failed to load logo" });
  }
});

// Save logo (admin only)
app.post("/api/settings/logo", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["logo"])) return;
    const { logo } = req.body || {};
    if (!logo) {
      return res.status(400).json({ error: "Logo is required" });
    }
    const logoValidation = validateDataUrlImage(logo);
    if (!logoValidation.ok) {
      return res.status(400).json({ error: logoValidation.error });
    }
    const result = await pool.query(
      `INSERT INTO app_settings (key, value)
       VALUES ('logo_image', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       RETURNING value`,
      [logo]
    );
    res.json({ logo: result.rows[0]?.value || null });
  } catch (err) {
    console.error("Failed to save logo:", err);
    res.status(500).json({ error: "Failed to save logo" });
  }
});
app.get("/api/settings/notification-targeting", requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = await getNotificationTargetingConfig();
    res.json(config);
  } catch (err) {
    console.error("Failed to load notification targeting settings:", err);
    res.status(500).json({ error: "Failed to load notification targeting settings" });
  }
});

app.put("/api/settings/notification-targeting", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["enableRoleTargeting", "enableUsernameTargeting", "allowedRoles"])) return;
    const config = await saveNotificationTargetingConfig(req.body || {});
    res.json(config);
  } catch (err) {
    console.error("Failed to save notification targeting settings:", err);
    res.status(500).json({ error: "Failed to save notification targeting settings" });
  }
});

app.get("/api/test", (req, res) => {
  res.json({ message: "Server is working 🎉" });
});

// ROLES (PROTECTED)
app.get("/api/roles", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id::text as id, name, created_at FROM roles ORDER BY name ASC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load roles" });
  }
});

app.post("/api/roles", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Role name is required" });
    }
    const result = await pool.query(
      "INSERT INTO roles (name) VALUES ($1) RETURNING id::text as id, name, created_at",
      [String(name).trim()]
    );
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "role.create",
      targetType: "role",
      targetId: result.rows[0].id,
      outcome: "success",
      req,
      meta: { name: result.rows[0].name }
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create role" });
  }
});

app.put("/api/roles/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Role name is required" });
    }
    const result = await pool.query(
      "UPDATE roles SET name = $1 WHERE id = $2 RETURNING id::text as id, name, created_at",
      [String(name).trim(), req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "role.update",
      targetType: "role",
      targetId: result.rows[0].id,
      outcome: "success",
      req,
      meta: { name: result.rows[0].name }
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

app.delete("/api/roles/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const roleResult = await pool.query(
      "SELECT id::text as id, name FROM roles WHERE id = $1",
      [req.params.id]
    );
    if (roleResult.rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    const roleName = roleResult.rows[0].name;
    const inUse = await pool.query(
      "SELECT 1 FROM users WHERE role = $1 LIMIT 1",
      [roleName]
    );
    if (inUse.rows.length > 0) {
      return res.status(400).json({ error: "Role is in use" });
    }

    const result = await pool.query(
      "DELETE FROM roles WHERE id = $1 RETURNING id::text as id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "role.delete",
      targetType: "role",
      targetId: result.rows[0].id,
      outcome: "success",
      req,
      meta: { name: roleName }
    });
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete role" });
  }
});

// DEPARTMENTS (PROTECTED)
app.get("/api/departments", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id::text as id,
              name,
              hod_title as "hodTitle",
              hod_name as "hodName",
              hod_mobile as "hodMobile",
              created_at as "createdAt",
              updated_at as "updatedAt"
       FROM departments
       ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load departments" });
  }
});

app.post("/api/departments", rateLimit({ keyPrefix: "departments-create", windowMs: 60_000, max: 20 }), requireAuthOrAccessCode, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["name", "hodTitle", "hodName", "hodMobile"])) return;
    const name = safeString(req.body?.name, 180);
    const hodTitle = safeString(req.body?.hodTitle, 40);
    const hodName = safeString(req.body?.hodName, 180);
    const hodMobile = safeString(req.body?.hodMobile, 40);
    if (!name) {
      return res.status(400).json({ error: "Department name is required" });
    }
    const result = await pool.query(
      `INSERT INTO departments (name, hod_title, hod_name, hod_mobile, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       RETURNING id::text as id,
                 name,
                 hod_title as "hodTitle",
                 hod_name as "hodName",
                 hod_mobile as "hodMobile",
                 created_at as "createdAt",
                 updated_at as "updatedAt"`,
      [name, hodTitle || null, hodName || null, hodMobile || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add department" });
  }
});

app.put("/api/departments/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["name", "hodTitle", "hodName", "hodMobile"])) return;
    const name = req.body?.name != null ? safeString(req.body.name, 180) : null;
    const hodTitle = req.body?.hodTitle != null ? safeString(req.body.hodTitle, 40) : null;
    const hodName = req.body?.hodName != null ? safeString(req.body.hodName, 180) : null;
    const hodMobile = req.body?.hodMobile != null ? safeString(req.body.hodMobile, 40) : null;
    const result = await pool.query(
      `UPDATE departments
       SET name = COALESCE($1, name),
           hod_title = COALESCE($2, hod_title),
           hod_name = COALESCE($3, hod_name),
           hod_mobile = COALESCE($4, hod_mobile),
           updated_at = NOW()
       WHERE id = $5
       RETURNING id::text as id,
                 name,
                 hod_title as "hodTitle",
                 hod_name as "hodName",
                 hod_mobile as "hodMobile",
                 created_at as "createdAt",
                 updated_at as "updatedAt"`,
      [name || null, hodTitle || null, hodName || null, hodMobile || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Department not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update department" });
  }
});

app.delete("/api/departments/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const memberUsage = await pool.query(
      "SELECT COUNT(*)::int as count FROM members WHERE department_id = $1",
      [id]
    );
    const profileUsage = await pool.query(
      "SELECT COUNT(*)::int as count FROM user_profiles WHERE department_id = $1",
      [id]
    );
    const usedCount = (memberUsage.rows[0]?.count || 0) + (profileUsage.rows[0]?.count || 0);
    if (usedCount > 0) {
      return res.status(400).json({ error: "Department is in use" });
    }
    const result = await pool.query(
      "DELETE FROM departments WHERE id = $1 RETURNING id::text as id",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Department not found" });
    }
    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete department" });
  }
});

// OTP SEND (PUBLIC) - by email
app.post("/api/otp/send", rateLimit({ keyPrefix: "otp-send", windowMs: 60_000, max: 5 }), async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

  const result = await pool.query(
    "SELECT id, username, role, status, email, restricted_menus, token_version FROM users WHERE email = $1",
    [email]
  );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Unrecognized email" });
    }

    const user = result.rows[0];

    if (!user.status) {
      return res.status(403).json({ error: "Account disabled" });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + OTP_TTL_MS;
    otpStore.set(email, { code, expiresAt, user });

    // In a real app, send via email/SMS here.
    console.log(`OTP for ${email}: ${code}`);

    const response = { message: "One-time code sent" };
    if (process.env.NODE_ENV !== "production") {
      response.devCode = code;
    }

    res.json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send code" });
  }
});

// OTP LOGIN (PUBLIC)
app.post("/api/otp/login", rateLimit({ keyPrefix: "otp-login", windowMs: 60_000, max: 10 }), async (req, res) => {
  const { email, code } = req.body || {};

  if (!email || !code) {
    return res.status(400).json({ error: "Email and code are required" });
  }

  const record = otpStore.get(email);
  if (!record || isExpired(record.expiresAt)) {
    otpStore.delete(email);
    return res.status(400).json({ error: "Code expired or not found" });
  }

  if (record.code !== code) {
    return res.status(400).json({ error: "Invalid code" });
  }

  const user = record.user;
  otpStore.delete(email);

  const { accessToken } = await issueAuthSession({ user, req, res });
  const sessionId = await createSession(user.id, req);
  await logAuditEvent({
    actorUserId: user.id,
    actorRole: user.role,
    action: "auth.otp_login",
    targetType: "user",
    targetId: String(user.id),
    outcome: "success",
    req
  });

  res.json({
    token: accessToken,
    sessionId,
    username: user.username,
    role: user.role,
    restrictedMenus: user.restricted_menus || []
  });
});

// LOGIN ROUTE (PUBLIC)
app.post("/api/login", rateLimit({ keyPrefix: "login", windowMs: 60_000, max: 10 }), async (req, res) => {
  try {
    const username = safeString(req.body?.username, 120);
    const password = safeString(req.body?.password, 256);

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (await isLoginLocked(req, username)) {
      return res.status(429).json({ error: "Too many failed attempts. Try again later." });
    }

    const result = await pool.query(
      "SELECT id, username, password_hash, role, status, restricted_menus, token_version FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      await recordLoginFailure(req, username);
      await logAuditEvent({
        action: "auth.login",
        targetType: "user",
        targetId: username,
        outcome: "failed",
        req,
        meta: { reason: "user_not_found" }
      });
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];

    if (!user.status) {
      return res.status(403).json({ error: "Account disabled" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await recordLoginFailure(req, username);
      await logAuditEvent({
        actorUserId: user.id,
        actorRole: user.role,
        action: "auth.login",
        targetType: "user",
        targetId: String(user.id),
        outcome: "failed",
        req,
        meta: { reason: "invalid_password" }
      });
      return res.status(401).json({ error: "Invalid username or password" });
    }

    await clearLoginFailures(req, username);

    const { accessToken } = await issueAuthSession({ user, req, res });

    const sessionId = await createSession(user.id, req);
    await logAuditEvent({
      actorUserId: user.id,
      actorRole: user.role,
      action: "auth.login",
      targetType: "user",
      targetId: String(user.id),
      outcome: "success",
      req
    });

    res.json({
      token: accessToken,
      sessionId,
      username: user.username,
      role: user.role,
      restrictedMenus: user.restricted_menus || []
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADD CELL (AUTH OR ACCESS CODE)
app.post("/api/cells", rateLimit({ keyPrefix: "cells-create", windowMs: 60_000, max: 20 }), requireAuthOrAccessCode, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["name", "venue", "day", "time", "description"])) return;
    const name = safeString(req.body?.name, 160);
    const venue = safeString(req.body?.venue, 200);
    const day = safeString(req.body?.day, 80);
    const time = safeString(req.body?.time, 40);
    const description = safeString(req.body?.description, 3000);
    if (!name) {
      return res.status(400).json({ error: "Cell name is required" });
    }

    const result = await pool.query(
      "INSERT INTO cells (name, venue, day, time, description) VALUES ($1,$2,$3,$4,$5) RETURNING id::text as id, name, venue, day, time, description",
      [name, venue, day, time, description]
    );

    const cell = result.rows[0];
    try {
      await createNotification({
        title: "New Cell Created",
        message: `Cell "${cell.name}" was created.`,
        type: "info"
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }

    res.json(cell);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add cell" });
  }
});

app.post("/api/auth/logout-all", requireAuth, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = $1",
      [req.user.userId]
    );
    await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(), revoke_reason = COALESCE(revoke_reason, 'logout_all')
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.user.userId]
    );
    clearAuthCookies(res);
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "auth.logout_all",
      targetType: "user",
      targetId: String(req.user.userId),
      outcome: "success",
      req
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to invalidate sessions" });
  }
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
  try {
    const cookies = parseCookies(req);
    if (cookies.refresh_token) {
      await revokeRefreshTokenByRaw(cookies.refresh_token, "logout");
    }
    clearAuthCookies(res);
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "auth.logout",
      targetType: "user",
      targetId: String(req.user.userId),
      outcome: "success",
      req
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to logout" });
  }
});

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const refreshToken = cookies.refresh_token || safeString(req.body?.refreshToken, 600);
    if (!refreshToken) {
      return res.status(401).json({ error: "Missing refresh token" });
    }

    const tokenHash = hashToken(refreshToken);
    const result = await pool.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.username, u.role, u.status, u.token_version
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const row = result.rows[0];
    if (!row.status || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
      return res.status(401).json({ error: "Refresh token expired" });
    }

    const user = {
      id: row.user_id,
      username: row.username,
      role: row.role,
      token_version: row.token_version
    };

    const { accessToken } = await issueAuthSession({
      user,
      req,
      res,
      previousRefreshToken: refreshToken
    });

    await logAuditEvent({
      actorUserId: user.id,
      actorRole: user.role,
      action: "auth.refresh",
      targetType: "user",
      targetId: String(user.id),
      outcome: "success",
      req
    });

    res.json({
      token: accessToken,
      username: user.username,
      role: user.role
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to refresh session" });
  }
});

// USERS (PROTECTED, ADMIN ONLY)
app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
      const result = await pool.query(
        `SELECT u.id::text as id,
                u.username,
                u.email,
                u.role,
                u.status,
                u.restricted_menus as "restrictedMenus",
                m.full_name as name
         FROM users u
         LEFT JOIN members m
           ON lower(m.email) = lower(u.email)
         ORDER BY u.id`
      );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load users" });
  }
});

app.get("/api/users/search", requireAuth, requireAdmin, async (req, res) => {
  try {
    const query = safeString(req.query?.q, 120);
    if (!query) {
      return res.json([]);
    }
    const like = `%${query}%`;
    const result = await pool.query(
      `SELECT id::text as id,
              username,
              email,
              role
       FROM users
       WHERE username ILIKE $1 OR email ILIKE $1
       ORDER BY username ASC
       LIMIT 20`,
      [like]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search users" });
  }
});

app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["username", "password", "email", "role", "status", "restrictedMenus"])) return;
    const username = safeString(req.body?.username, 120);
    const password = safeString(req.body?.password, 256);
    const email = safeString(req.body?.email, 180).toLowerCase();
    const role = safeString(req.body?.role, 80);
    const status = typeof req.body?.status === "boolean" ? req.body.status : true;
    const restrictedMenus = Array.isArray(req.body?.restrictedMenus) ? req.body.restrictedMenus.map((item) => safeString(item, 80)).filter(Boolean) : [];

    if (!username || !password || !email || !role) {
      return res.status(400).json({ error: "Username, email, password, and role are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const restrictedMenusJson = JSON.stringify(restrictedMenus || []);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, status, restricted_menus)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id::text as id, username, email, role, status, restricted_menus as "restrictedMenus"`,
      [username, email, passwordHash, role, status ?? true, restrictedMenusJson]
    );

    await ensureUserProfileForUser({
      userId: result.rows[0].id,
      email: result.rows[0].email,
      username: result.rows[0].username,
      role: result.rows[0].role
    });
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "user.create",
      targetType: "user",
      targetId: result.rows[0].id,
      outcome: "success",
      req,
      meta: { username: result.rows[0].username, role: result.rows[0].role }
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add user" });
  }
});

app.put("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["username", "password", "email", "role", "status", "restrictedMenus"])) return;
    const username = req.body?.username != null ? safeString(req.body.username, 120) : null;
    const password = req.body?.password != null ? safeString(req.body.password, 256) : null;
    const email = req.body?.email != null ? safeString(req.body.email, 180).toLowerCase() : null;
    const role = req.body?.role != null ? safeString(req.body.role, 80) : null;
    const status = typeof req.body?.status === "boolean" ? req.body.status : null;
    const restrictedMenus = Array.isArray(req.body?.restrictedMenus) ? req.body.restrictedMenus.map((item) => safeString(item, 80)).filter(Boolean) : null;

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    const restrictedMenusJson = restrictedMenus ? JSON.stringify(restrictedMenus) : null;

    const result = await pool.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           email = COALESCE($2, email),
           password_hash = COALESCE($3, password_hash),
           token_version = CASE WHEN $3 IS NOT NULL THEN COALESCE(token_version, 1) + 1 ELSE token_version END,
           role = COALESCE($4, role),
           status = COALESCE($5, status),
           restricted_menus = COALESCE($6, restricted_menus)
       WHERE id = $7
       RETURNING id::text as id, username, email, role, status, restricted_menus as "restrictedMenus", token_version as "tokenVersion"`,
      [
        username ?? null,
        email ?? null,
        passwordHash,
        role ?? null,
        status ?? null,
        restrictedMenusJson,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    await ensureUserProfileForUser({
      userId: result.rows[0].id,
      email: result.rows[0].email,
      username: result.rows[0].username,
      role: result.rows[0].role
    });
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "user.update",
      targetType: "user",
      targetId: result.rows[0].id,
      outcome: "success",
      req,
      meta: { username: result.rows[0].username, role: result.rows[0].role }
    });

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id::text as id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    await logAuditEvent({
      actorUserId: req.user.userId,
      actorRole: req.user.role,
      action: "user.delete",
      targetType: "user",
      targetId: result.rows[0].id,
      outcome: "success",
      req
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// USER PROFILES
app.get("/api/profile/me", requireAuth, async (req, res) => {
  try {
    const userLookup = await pool.query(
      "SELECT id, username, email, role FROM users WHERE id = $1 LIMIT 1",
      [req.user.userId]
    );
    const me = userLookup.rows[0];
    if (!me) {
      return res.status(404).json({ error: "User not found" });
    }
    await ensureUserProfileForUser({
      userId: me.id,
      email: me.email,
      username: me.username,
      role: me.role
    });
    await refreshProfileFromEmail(me.id);

    const profile = await getProfileView(req.user.userId);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put("/api/profile/me", requireAuth, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, [
      "title", "fullName", "phone", "roleTitle", "cellId", "dateOfBirth", "address", "postcode", "photoData",
      "email", "cellName", "cellVenue", "cellLeader", "cellLeaderMobile", "departmentName", "hodName", "hodMobile"
    ])) return;
    const photoCheck = validateDataUrlImage(req.body?.photoData);
    if (!photoCheck.ok) {
      return res.status(400).json({ error: photoCheck.error });
    }
    await applyProfileUpdate(req.user.userId, req.body || {}, "self");
    const profile = await getProfileView(req.user.userId);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.get("/api/profiles/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    await refreshProfileFromEmail(req.params.userId);
    const profile = await getProfileView(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put("/api/profiles/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, [
      "title", "fullName", "phone", "roleTitle", "cellId", "dateOfBirth", "address", "postcode", "photoData",
      "email", "cellName", "cellVenue", "cellLeader", "cellLeaderMobile", "departmentName", "hodName", "hodMobile"
    ])) return;
    const photoCheck = validateDataUrlImage(req.body?.photoData);
    if (!photoCheck.ok) {
      return res.status(400).json({ error: photoCheck.error });
    }
    await applyProfileUpdate(req.params.userId, req.body || {}, "manual");
    const profile = await getProfileView(req.params.userId);
    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.get("/api/profile/by-email", requireAuth, async (req, res) => {
  try {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }
    const profile = await getProfileByEmail(email);
    if (!profile) {
      return res.status(404).json({ error: "No profile data found for this email" });
    }
    res.json(profile);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to lookup profile by email" });
  }
});

// SESSIONS (PROTECTED, ADMIN ONLY)
app.get("/api/sessions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id::text as id,
              s.login_time as "loginTime",
              s.logout_time as "logoutTime",
              s.ip_address as "ipAddress",
              s.user_agent as "userAgent",
              s.idle_ms as "idleMs",
              s.active_ms as "activeMs",
              s.last_activity as "lastActivity",
              u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       ORDER BY s.login_time DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load sessions" });
  }
});

app.put("/api/sessions/:id/end", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE sessions
       SET logout_time = NOW()
       WHERE id = $1
       RETURNING id::text as id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to end session" });
  }
});

app.put("/api/sessions/:id/metrics", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { idleMs, activeMs } = req.body || {};
    const result = await pool.query(
      `UPDATE sessions
       SET idle_ms = COALESCE($1, idle_ms),
           active_ms = COALESCE($2, active_ms),
           last_activity = NOW()
       WHERE id = $3
       RETURNING id::text as id`,
      [idleMs ?? null, activeMs ?? null, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update session metrics" });
  }
});

app.delete("/api/sessions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM sessions");
    res.json({ ok: true, deleted: result.rowCount || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear sessions" });
  }
});

app.get("/api/audit-logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit) || 200, 1), 1000);
    const result = await pool.query(
      `SELECT id::text as id,
              actor_user_id::text as "actorUserId",
              actor_role as "actorRole",
              action,
              target_type as "targetType",
              target_id as "targetId",
              outcome,
              ip_address as "ipAddress",
              user_agent as "userAgent",
              metadata,
              created_at as "createdAt"
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load audit logs" });
  }
});

// GET CELLS (PROTECTED OR ACCESS CODE)
app.get("/api/cells", requireAuthOrAccessCode, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id::text as id, name, venue, day, time, description FROM cells ORDER BY id"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load cells" });
  }
});

// UPDATE CELL (PROTECTED)
app.put("/api/cells/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["name", "venue", "day", "time", "description"])) return;
    const name = req.body?.name != null ? safeString(req.body.name, 160) : null;
    const venue = req.body?.venue != null ? safeString(req.body.venue, 200) : null;
    const day = req.body?.day != null ? safeString(req.body.day, 80) : null;
    const time = req.body?.time != null ? safeString(req.body.time, 40) : null;
    const description = req.body?.description != null ? safeString(req.body.description, 3000) : null;
    const result = await pool.query(
      `UPDATE cells
       SET name = COALESCE($1, name),
           venue = COALESCE($2, venue),
           day = COALESCE($3, day),
           time = COALESCE($4, time),
           description = COALESCE($5, description)
       WHERE id = $6
       RETURNING id::text as id, name, venue, day, time, description`,
      [
        name ?? null,
        venue ?? null,
        day ?? null,
        time ?? null,
        description ?? null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cell not found" });
    }

    const cell = result.rows[0];
    try {
      await createNotification({
        title: "Cell Updated",
        message: `Cell "${cell.name}" was updated.`,
        type: "info"
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }

    res.json(cell);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update cell" });
  }
});

// DELETE CELL (PROTECTED)
app.delete("/api/cells/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM cells WHERE id = $1 RETURNING id::text as id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Cell not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete cell" });
  }
});

// GET MEMBERS (PROTECTED)
app.get("/api/members", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id::text as id,
              m.cell_id::text as "cellId",
              m.title,
              m.name,
              m.gender,
              m.mobile,
              m.email,
              m.role,
              m.is_first_timer as "isFirstTimer",
              m.foundation_school as "foundationSchool",
              m.dob_month as "dobMonth",
              m.dob_day as "dobDay",
              CASE
                WHEN m.dob_month IS NOT NULL AND m.dob_day IS NOT NULL
                  THEN LPAD(m.dob_month::text, 2, '0') || '-' || LPAD(m.dob_day::text, 2, '0')
                WHEN m.date_of_birth IS NOT NULL
                  THEN TO_CHAR(m.date_of_birth, 'MM-DD')
                ELSE NULL
              END as "dateOfBirth",
              m.joined_date as "joinedDate",
              c.name as "cellName",
              c.venue as "cellVenue",
              c.day as "cellDay",
              c.time as "cellTime",
              COALESCE(m.department_id, up.department_id) as "departmentId",
              d.name as "departmentName",
              d.hod_name as "departmentHead",
              d.hod_mobile as "departmentHeadMobile"
       FROM members m
       LEFT JOIN cells c ON c.id = m.cell_id
       LEFT JOIN user_profiles up ON LOWER(up.email) = LOWER(m.email)
       LEFT JOIN departments d ON d.id = COALESCE(m.department_id, up.department_id)
       ORDER BY m.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load members" });
  }
});

// ADD MEMBER (AUTH OR ACCESS CODE)
app.post("/api/members", rateLimit({ keyPrefix: "members-create", windowMs: 60_000, max: 40 }), requireAuthOrAccessCode, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["cellId", "departmentId", "title", "name", "gender", "mobile", "email", "role", "isFirstTimer", "foundationSchool", "dateOfBirth", "dobMonth", "dobDay"])) return;
    const cellId = req.body?.cellId ?? null;
    const departmentId = req.body?.departmentId ?? null;
    const title = safeString(req.body?.title, 40);
    const name = safeString(req.body?.name, 180);
    const gender = safeString(req.body?.gender, 20);
    const mobile = safeString(req.body?.mobile, 40);
    const email = safeString(req.body?.email, 180).toLowerCase();
    const role = safeString(req.body?.role, 100);
    const isFirstTimer = req.body?.isFirstTimer;
    const foundationSchool = req.body?.foundationSchool;
    const dateOfBirth = req.body?.dateOfBirth;
    const dobMonth = req.body?.dobMonth;
    const dobDay = req.body?.dobDay;

    if (!name) {
      return res.status(400).json({ error: "Member name is required" });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!isValidGender(gender)) {
      return res.status(400).json({ error: "Invalid gender" });
    }
    const parsedDob = parseMonthDay(dateOfBirth || (dobMonth && dobDay ? `${dobMonth}-${dobDay}` : ""));

    const result = await pool.query(
      `INSERT INTO members (cell_id, department_id, title, name, gender, mobile, email, role, is_first_timer, foundation_school, dob_month, dob_day, date_of_birth, joined_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NULL, NOW())
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 department_id::text as "departmentId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 is_first_timer as "isFirstTimer",
                 foundation_school as "foundationSchool",
                 dob_month as "dobMonth",
                 dob_day as "dobDay",
                 CASE
                   WHEN dob_month IS NOT NULL AND dob_day IS NOT NULL
                     THEN LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0')
                   ELSE NULL
                 END as "dateOfBirth",
                 joined_date as "joinedDate"`,
      [cellId, departmentId, title, name, gender, mobile, email, role, !!isFirstTimer, !!foundationSchool, parsedDob.month, parsedDob.day]
    );

    const member = result.rows[0];

    await syncProfileByEmail({
      email: member.email,
      fullName: member.name,
      phone: member.mobile,
      roleTitle: member.role,
      cellId: member.cellId,
      departmentId: member.departmentId,
      dobMonth: member.dobMonth || parseMonthDay(member.dateOfBirth).month,
      dobDay: member.dobDay || parseMonthDay(member.dateOfBirth).day,
      source: "member-sync"
    });

    if (isFirstTimer) {
      const existing = await pool.query(
        `SELECT id
         FROM first_timers
         WHERE name = $1
           AND mobile IS NOT DISTINCT FROM $2
           AND cell_id IS NOT DISTINCT FROM $3
         LIMIT 1`,
        [name, mobile || null, cellId || null]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO first_timers (name, mobile, date_joined, status, foundation_school, cell_id, invited_by, source)
           VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7)`,
          [name, mobile || null, "amber", "Not Yet", cellId || null, null, "cell"]
        );
      }
    }

    try {
      await createNotification({
        title: "New Member Added",
        message: `Member "${member.name}" was added.`,
        type: "info"
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }

    res.json(member);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add member" });
  }
});

// UPDATE MEMBER (PROTECTED)
app.put("/api/members/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["title", "name", "gender", "mobile", "email", "role", "isFirstTimer", "foundationSchool", "cellId", "departmentId", "dateOfBirth", "dobMonth", "dobDay"])) return;
    const title = req.body?.title != null ? safeString(req.body.title, 40) : null;
    const name = req.body?.name != null ? safeString(req.body.name, 180) : null;
    const gender = req.body?.gender != null ? safeString(req.body.gender, 20) : null;
    const mobile = req.body?.mobile != null ? safeString(req.body.mobile, 40) : null;
    const email = req.body?.email != null ? safeString(req.body.email, 180).toLowerCase() : null;
    const role = req.body?.role != null ? safeString(req.body.role, 100) : null;
    const isFirstTimer = req.body?.isFirstTimer;
    const foundationSchool = req.body?.foundationSchool;
    const cellId = req.body?.cellId;
    const departmentId = req.body?.departmentId;
    const dateOfBirth = req.body?.dateOfBirth;
    const dobMonth = req.body?.dobMonth;
    const dobDay = req.body?.dobDay;
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (gender && !isValidGender(gender)) {
      return res.status(400).json({ error: "Invalid gender" });
    }
    const parsedDob = parseMonthDay(dateOfBirth || (dobMonth && dobDay ? `${dobMonth}-${dobDay}` : ""));
    const hasDobInput = Object.prototype.hasOwnProperty.call(req.body || {}, "dateOfBirth")
      || Object.prototype.hasOwnProperty.call(req.body || {}, "dobMonth")
      || Object.prototype.hasOwnProperty.call(req.body || {}, "dobDay");
    const result = await pool.query(
      `UPDATE members
       SET title = COALESCE($1, title),
           name = COALESCE($2, name),
           gender = COALESCE($3, gender),
           mobile = COALESCE($4, mobile),
           email = COALESCE($5, email),
           role = COALESCE($6, role),
           cell_id = COALESCE($7, cell_id),
           department_id = COALESCE($8, department_id),
           is_first_timer = COALESCE($9, is_first_timer),
           foundation_school = COALESCE($10, foundation_school),
           dob_month = COALESCE($11, dob_month),
           dob_day = COALESCE($12, dob_day),
           date_of_birth = NULL
       WHERE id = $13
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 department_id::text as "departmentId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 is_first_timer as "isFirstTimer",
                 foundation_school as "foundationSchool",
                 dob_month as "dobMonth",
                 dob_day as "dobDay",
                 CASE
                   WHEN dob_month IS NOT NULL AND dob_day IS NOT NULL
                     THEN LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0')
                   ELSE NULL
                 END as "dateOfBirth",
                 joined_date as "joinedDate"`,
      [
        title ?? null,
        name ?? null,
        gender ?? null,
        mobile ?? null,
        email ?? null,
        role ?? null,
        cellId ?? null,
        departmentId ?? null,
        typeof isFirstTimer === "boolean" ? isFirstTimer : null,
        typeof foundationSchool === "boolean" ? foundationSchool : null,
        hasDobInput ? parsedDob.month : null,
        hasDobInput ? parsedDob.day : null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }

    const member = result.rows[0];

    await syncProfileByEmail({
      email: member.email,
      fullName: member.name,
      phone: member.mobile,
      roleTitle: member.role,
      cellId: member.cellId,
      departmentId: member.departmentId,
      dobMonth: member.dobMonth || parseMonthDay(member.dateOfBirth).month,
      dobDay: member.dobDay || parseMonthDay(member.dateOfBirth).day,
      source: "member-sync"
    });

    if (isFirstTimer === true) {
      const existing = await pool.query(
        `SELECT id
         FROM first_timers
         WHERE name = $1
           AND mobile IS NOT DISTINCT FROM $2
           AND cell_id IS NOT DISTINCT FROM $3
         LIMIT 1`,
        [member.name, member.mobile || null, member.cellId || null]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO first_timers (name, mobile, date_joined, status, foundation_school, cell_id, invited_by, source)
           VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7)`,
          [member.name, member.mobile || null, "amber", "Not Yet", member.cellId || null, null, "cell"]
        );
      }
    }

    try {
      await createNotification({
        title: "Member Updated",
        message: `Member "${member.name}" was updated.`,
        type: "info"
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }

    res.json(member);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update member" });
  }
});

// DELETE MEMBER (PROTECTED)
app.delete("/api/members/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM members WHERE id = $1 RETURNING id::text as id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete member" });
  }
});

// MEMBER ATTENDANCE SUMMARY (PROTECTED)
app.get("/api/members/:id/attendance", requireAuth, async (req, res) => {
  try {
    const memberId = String(req.params.id);
    const result = await pool.query(
      `SELECT r.id::text as id,
              r.cell_id::text as "cellId",
              r.report_date as "reportDate",
              r.date,
              r.meeting_type as "meetingType",
              r.attendees
       FROM reports r
       WHERE r.attendees IS NOT NULL
       ORDER BY r.report_date DESC NULLS LAST, r.id DESC`
    );

    let present = 0;
    let absent = 0;
    const records = [];

    for (const row of result.rows) {
      let attendees = row.attendees;
      if (typeof attendees === "string") {
        try {
          attendees = JSON.parse(attendees);
        } catch {
          attendees = [];
        }
      }
      if (!Array.isArray(attendees)) attendees = [];
      const hit = attendees.find((item) => String(item?.memberId ?? item?.id ?? "") === memberId);
      if (!hit) continue;
      const isPresent = hit.present === true;
      if (isPresent) present += 1;
      else absent += 1;
      records.push({
        reportId: row.id,
        cellId: row.cellId,
        reportDate: row.reportDate || row.date || null,
        meetingType: row.meetingType || null,
        present: isPresent
      });
    }

    res.json({
      memberId,
      present,
      absent,
      total: present + absent,
      records
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load attendance" });
  }
});

// GET REPORTS (PROTECTED)
app.get("/api/reports", requireAuth, async (req, res) => {
  try {
    const { cellId } = req.query;
    const params = [];
    let whereClause = "";

    if (cellId) {
      params.push(cellId);
      whereClause = "WHERE cell_id = $1";
    }

    const result = await pool.query(
      `SELECT id::text as id,
              cell_id::text as "cellId",
              date,
              venue,
              meeting_type as "meetingType",
              description,
              attendees
       FROM reports
       ${whereClause}
       ORDER BY date DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load reports" });
  }
});

// ===============================
// 6.5) FIRST-TIMERS & FOLLOW-UPS
// ===============================

// GET FIRST-TIMERS (PROTECTED)
app.get("/api/first-timers", requireAuth, async (req, res) => {
  try {
      const includeArchived = String(req.query.includeArchived || "").toLowerCase() === "true";
      const archivedOnly = String(req.query.archived || "").toLowerCase() === "true";
      const foundationSchoolOnly = String(req.query.foundationSchool || "").toLowerCase() === "true";
      const where = [];
      const params = [];
      if (archivedOnly) {
        where.push("ft.archived = TRUE");
      } else if (!includeArchived) {
        where.push("COALESCE(ft.archived, FALSE) = FALSE");
      }
      if (foundationSchoolOnly) {
        where.push("COALESCE(ft.in_foundation_school, FALSE) = TRUE");
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const result = await pool.query(
          `SELECT ft.id::text as id,
                  ft.title,
                  ft.name,
                  ft.surname,
                ft.gender,
                ft.mobile,
                ft.email,
                ft.photo_data as "photoData",
                ft.address,
                ft.postcode,
                ft.date_joined as "dateJoined",
              ft.birthday_month as "birthdayMonth",
              ft.birthday_day as "birthdayDay",
              ft.age_group as "ageGroup",
              ft.marital_status as "maritalStatus",
              ft.born_again as "bornAgain",
              ft.speak_tongues as "speakTongues",
              COALESCE(ft.find_out, '[]'::jsonb) as "findOut",
              COALESCE(ft.contact_pref, '[]'::jsonb) as "contactPref",
              ft.visit,
              ft.visit_when as "visitWhen",
              COALESCE(ft.prayer_requests, '[]'::jsonb) as "prayerRequests",
              ft.status,
              ft.foundation_school as "foundationSchool",
              ft.foundation_class as "foundationClass",
              ft.exam_status as "examStatus",
              ft.graduation_date as "graduationDate",
              ft.graduated_year as "graduatedYear",
              COALESCE(ft.is_graduate, FALSE) as "isGraduate",
              COALESCE(ft.foundation_tracking, '{}'::jsonb) as "foundationTracking",
              ft.invited_by as "invitedBy",
              COALESCE(ft.archived, FALSE) as archived,
              COALESCE(ft.in_foundation_school, FALSE) as "inFoundationSchool",
              COALESCE(ft.source, 'manual') as source,
              ft.department_id::text as "departmentId",
              d.name as "departmentName",
              ft.cell_id::text as "cellId",
              c.name as "cellName"
       FROM first_timers ft
       LEFT JOIN cells c ON c.id = ft.cell_id
       LEFT JOIN departments d ON d.id = ft.department_id
       ${whereSql}
       ORDER BY ft.date_joined DESC NULLS LAST, ft.id DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load first-timers" });
  }
});

// ADD FIRST-TIMER (PROTECTED OR ACCESS CODE)
app.post("/api/first-timers", rateLimit({ keyPrefix: "first-timers-create", windowMs: 60_000, max: 30 }), requireAuthOrAccessCode, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, [
      "title", "name", "surname", "gender", "mobile", "email", "photoData", "address", "postcode", "birthday",
      "ageGroup", "maritalStatus", "bornAgain", "speakTongues", "findOut", "contactPref", "visit", "visitWhen",
      "prayerRequests", "dateJoined", "status", "foundationSchool", "foundationClass", "examStatus", "graduationDate",
      "graduatedYear", "isGraduate", "cellId", "departmentId", "invitedBy", "foundationTracking"
    ])) return;
    const {
      title,
      name,
      surname,
      gender,
      mobile,
      email,
      photoData,
      address,
      postcode,
      birthday,
      ageGroup,
      maritalStatus,
      bornAgain,
      speakTongues,
      findOut,
      contactPref,
      visit,
      visitWhen,
      prayerRequests,
      dateJoined,
      status,
      foundationSchool,
      foundationClass,
      examStatus,
      graduationDate,
      graduatedYear,
      isGraduate,
      cellId,
      departmentId,
      invitedBy,
      foundationTracking
    } = req.body || {};
    const photoCheck = validateDataUrlImage(photoData);
    if (!photoCheck.ok) {
      return res.status(400).json({ error: photoCheck.error });
    }

    if (!safeString(name, 180)) {
      return res.status(400).json({ error: "Name is required" });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (!isValidGender(gender)) {
      return res.status(400).json({ error: "Invalid gender" });
    }

    const parsedBirthday = parseMonthDay(birthday);
    const safeFindOut = toTextArray(findOut);
    const safeContactPref = toTextArray(contactPref);
    const safePrayerRequests = toTextArray(prayerRequests);
    const safeFoundationTracking =
      foundationTracking && typeof foundationTracking === "object" && !Array.isArray(foundationTracking)
        ? foundationTracking
        : null;

    const existing = await pool.query(
      `SELECT ft.id::text as id,
              ft.title,
              ft.name,
              ft.surname,
                ft.gender,
                ft.mobile,
                ft.email,
                ft.photo_data as "photoData",
                ft.address,
              ft.postcode,
              ft.date_joined as "dateJoined",
              ft.birthday_month as "birthdayMonth",
              ft.birthday_day as "birthdayDay",
              ft.age_group as "ageGroup",
              ft.marital_status as "maritalStatus",
              ft.born_again as "bornAgain",
              ft.speak_tongues as "speakTongues",
              COALESCE(ft.find_out, '[]'::jsonb) as "findOut",
              COALESCE(ft.contact_pref, '[]'::jsonb) as "contactPref",
              ft.visit,
              ft.visit_when as "visitWhen",
              COALESCE(ft.prayer_requests, '[]'::jsonb) as "prayerRequests",
              ft.status,
              ft.foundation_school as "foundationSchool",
              ft.foundation_class as "foundationClass",
              ft.exam_status as "examStatus",
              ft.graduation_date as "graduationDate",
              ft.graduated_year as "graduatedYear",
              COALESCE(ft.is_graduate, FALSE) as "isGraduate",
              ft.invited_by as "invitedBy",
              COALESCE(ft.archived, FALSE) as archived,
              COALESCE(ft.in_foundation_school, FALSE) as "inFoundationSchool",
              COALESCE(ft.source, 'manual') as source,
              ft.department_id::text as "departmentId",
              d.name as "departmentName",
              ft.cell_id::text as "cellId",
              c.name as "cellName"
       FROM first_timers ft
       LEFT JOIN cells c ON c.id = ft.cell_id
       LEFT JOIN departments d ON d.id = ft.department_id
       WHERE ft.name = $1
         AND ft.mobile IS NOT DISTINCT FROM $2
         AND ft.cell_id IS NOT DISTINCT FROM $3
       LIMIT 1`,
      [name, mobile || null, cellId || null]
    );
    if (existing.rows.length) {
      return res.json(existing.rows[0]);
    }

    const result = await pool.query(
      `INSERT INTO first_timers (
           title, name, surname, gender, mobile, email, photo_data, address, postcode,
         birthday_month, birthday_day, age_group, marital_status, born_again, speak_tongues,
         find_out, contact_pref, visit, visit_when, prayer_requests,
         date_joined, status, foundation_school, foundation_class, exam_status, graduation_date, graduated_year, is_graduate, cell_id, department_id, invited_by, foundation_tracking, source
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18,$19,$20::jsonb,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32::jsonb,$33)
       RETURNING id::text as id,
                 title,
                 name,
                 surname,
                 gender,
                 mobile,
                 email,
                 photo_data as "photoData",
                 address,
                 postcode,
                 date_joined as "dateJoined",
                 birthday_month as "birthdayMonth",
                 birthday_day as "birthdayDay",
                 age_group as "ageGroup",
                 marital_status as "maritalStatus",
                 born_again as "bornAgain",
                 speak_tongues as "speakTongues",
                 COALESCE(find_out, '[]'::jsonb) as "findOut",
                 COALESCE(contact_pref, '[]'::jsonb) as "contactPref",
                 visit,
                 visit_when as "visitWhen",
                 COALESCE(prayer_requests, '[]'::jsonb) as "prayerRequests",
                 status,
                 foundation_school as "foundationSchool",
                 foundation_class as "foundationClass",
                 exam_status as "examStatus",
                 graduation_date as "graduationDate",
                 graduated_year as "graduatedYear",
                 COALESCE(is_graduate, FALSE) as "isGraduate",
                 COALESCE(foundation_tracking, '{}'::jsonb) as "foundationTracking",
                 invited_by as "invitedBy",
                 COALESCE(archived, FALSE) as archived,
                 COALESCE(in_foundation_school, FALSE) as "inFoundationSchool",
                 COALESCE(source, 'manual') as source,
                 department_id::text as "departmentId",
                 cell_id::text as "cellId"`,
      [
        title || null,
        name,
        surname || null,
        gender || null,
        mobile || null,
        email || null,
        photoData || null,
        address || null,
        postcode || null,
        parsedBirthday.month,
        parsedBirthday.day,
        ageGroup || null,
        maritalStatus || null,
        toBooleanOrNull(bornAgain),
        toBooleanOrNull(speakTongues),
        JSON.stringify(safeFindOut),
        JSON.stringify(safeContactPref),
        toBooleanOrNull(visit),
        visitWhen || null,
        JSON.stringify(safePrayerRequests),
        dateJoined || null,
        status || "amber",
        foundationSchool || "Not Yet",
        foundationClass || null,
        examStatus || null,
        graduationDate || null,
        graduatedYear || null,
        toBooleanOrNull(isGraduate) ?? false,
        cellId || null,
        departmentId || null,
        invitedBy || null,
        safeFoundationTracking ? JSON.stringify(safeFoundationTracking) : null,
        cellId ? "cell" : "manual"
      ]
    );

    // If a cell is selected, add to members list as First-Timer
    if (cellId) {
      await pool.query(
        `INSERT INTO members (cell_id, title, name, gender, mobile, email, role, joined_date, is_first_timer)
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), TRUE)`,
        [cellId, title || "First-Timer", name, gender || "Unknown", mobile || "", null, "First-Timer"]
      );
    }

    try {
      await syncProfileByEmail({
        email: result.rows[0].email,
        fullName: [result.rows[0].name, result.rows[0].surname].filter(Boolean).join(" ").trim() || result.rows[0].name,
        phone: result.rows[0].mobile,
        roleTitle: "First-Timer",
        cellId: result.rows[0].cellId,
        dobMonth: result.rows[0].birthdayMonth || null,
        dobDay: result.rows[0].birthdayDay || null,
        address: result.rows[0].address,
        source: "first-timer-sync"
      });
    } catch (profileErr) {
      console.error("Profile sync failed after first-timer update:", profileErr);
    }

    if (toBooleanOrNull(isGraduate) === true) {
      await pool.query(
        `UPDATE members
         SET foundation_school = TRUE
         WHERE LOWER(email) = LOWER($1)`,
        [result.rows[0].email || ""]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add first-timer" });
  }
});

// UPDATE FIRST-TIMER (PROTECTED)
app.put("/api/first-timers/:id", requireAuth, requireStaff, async (req, res) => {
  try {
      if (!validateWritePayload(req, res, [
        "title", "name", "surname", "gender", "mobile", "email", "photoData", "address", "postcode", "birthday",
        "ageGroup", "maritalStatus", "bornAgain", "speakTongues", "findOut", "contactPref", "visit", "visitWhen",
        "prayerRequests", "dateJoined", "status", "foundationSchool", "foundationClass", "examStatus", "graduationDate",
        "graduatedYear", "isGraduate", "cellId", "departmentId", "invitedBy", "foundationTracking"
      ])) return;
      const {
        title,
        name,
        surname,
        gender,
        mobile,
        email,
        photoData,
        address,
        postcode,
        birthday,
        ageGroup,
        maritalStatus,
        bornAgain,
        speakTongues,
        findOut,
        contactPref,
        visit,
        visitWhen,
        prayerRequests,
        dateJoined,
        status,
        foundationSchool,
        foundationClass,
        examStatus,
        graduationDate,
        graduatedYear,
        isGraduate,
        cellId,
        departmentId,
        invitedBy,
        foundationTracking
    } = req.body || {};
    const photoCheck = validateDataUrlImage(photoData);
    if (!photoCheck.ok) {
      return res.status(400).json({ error: photoCheck.error });
    }

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    if (gender && !isValidGender(gender)) {
      return res.status(400).json({ error: "Invalid gender" });
    }

    const parsedBirthday = parseMonthDay(birthday);
    const safeFindOut = toTextArray(findOut);
    const safeContactPref = toTextArray(contactPref);
    const safePrayerRequests = toTextArray(prayerRequests);
    const safeFoundationTracking =
      foundationTracking && typeof foundationTracking === "object" && !Array.isArray(foundationTracking)
        ? foundationTracking
        : null;

    const result = await pool.query(
      `UPDATE first_timers
       SET title = COALESCE($1, title),
           name = COALESCE($2, name),
           surname = COALESCE($3, surname),
           gender = COALESCE($4, gender),
           mobile = COALESCE($5, mobile),
           email = COALESCE($6, email),
           photo_data = COALESCE($7, photo_data),
           address = COALESCE($8, address),
           postcode = COALESCE($9, postcode),
           birthday_month = COALESCE($10, birthday_month),
           birthday_day = COALESCE($11, birthday_day),
           age_group = COALESCE($12, age_group),
           marital_status = COALESCE($13, marital_status),
           born_again = COALESCE($14, born_again),
           speak_tongues = COALESCE($15, speak_tongues),
           find_out = COALESCE($16::jsonb, find_out),
           contact_pref = COALESCE($17::jsonb, contact_pref),
           visit = COALESCE($18, visit),
           visit_when = COALESCE($19, visit_when),
           prayer_requests = COALESCE($20::jsonb, prayer_requests),
           date_joined = COALESCE($21, date_joined),
           status = COALESCE($22, status),
           foundation_school = COALESCE($23, foundation_school),
           foundation_class = COALESCE($24, foundation_class),
           exam_status = COALESCE($25, exam_status),
           graduation_date = COALESCE($26, graduation_date),
           graduated_year = COALESCE($27, graduated_year),
           is_graduate = COALESCE($28, is_graduate),
           cell_id = COALESCE($29, cell_id),
           department_id = COALESCE($30, department_id),
           invited_by = COALESCE($31, invited_by),
           foundation_tracking = COALESCE($32::jsonb, foundation_tracking)
       WHERE id = $33
       RETURNING id::text as id,
                 title,
                 name,
                   surname,
                   gender,
                   mobile,
                   email,
                   photo_data as "photoData",
                   address,
                 postcode,
                 date_joined as "dateJoined",
                 birthday_month as "birthdayMonth",
                 birthday_day as "birthdayDay",
                 age_group as "ageGroup",
                 marital_status as "maritalStatus",
                 born_again as "bornAgain",
                 speak_tongues as "speakTongues",
                 COALESCE(find_out, '[]'::jsonb) as "findOut",
                 COALESCE(contact_pref, '[]'::jsonb) as "contactPref",
                 visit,
                 visit_when as "visitWhen",
                 COALESCE(prayer_requests, '[]'::jsonb) as "prayerRequests",
                 status,
                 foundation_school as "foundationSchool",
                 foundation_class as "foundationClass",
                 exam_status as "examStatus",
                 graduation_date as "graduationDate",
                 graduated_year as "graduatedYear",
                 COALESCE(is_graduate, FALSE) as "isGraduate",
                 COALESCE(foundation_tracking, '{}'::jsonb) as "foundationTracking",
                 invited_by as "invitedBy",
                 COALESCE(archived, FALSE) as archived,
                 COALESCE(in_foundation_school, FALSE) as "inFoundationSchool",
                 COALESCE(source, 'manual') as source,
                 department_id::text as "departmentId",
                 cell_id::text as "cellId"`,
      [
        title ?? null,
        name ?? null,
        surname ?? null,
        gender ?? null,
        mobile ?? null,
        email ?? null,
        photoData ?? null,
        address ?? null,
        postcode ?? null,
        parsedBirthday.month,
        parsedBirthday.day,
        ageGroup ?? null,
        maritalStatus ?? null,
        toBooleanOrNull(bornAgain),
        toBooleanOrNull(speakTongues),
        safeFindOut.length ? JSON.stringify(safeFindOut) : null,
        safeContactPref.length ? JSON.stringify(safeContactPref) : null,
        toBooleanOrNull(visit),
        visitWhen ?? null,
        safePrayerRequests.length ? JSON.stringify(safePrayerRequests) : null,
        dateJoined ?? null,
        status ?? null,
        foundationSchool ?? null,
        foundationClass ?? null,
        examStatus ?? null,
        graduationDate ?? null,
        graduatedYear ?? null,
        typeof isGraduate === "boolean" ? isGraduate : null,
        cellId ?? null,
        departmentId ?? null,
        invitedBy ?? null,
        safeFoundationTracking ? JSON.stringify(safeFoundationTracking) : null,
        req.params.id
      ]
      );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "First-timer not found" });
    }

    await syncProfileByEmail({
      email: result.rows[0].email,
      fullName: [result.rows[0].name, result.rows[0].surname].filter(Boolean).join(" ").trim() || result.rows[0].name,
      phone: result.rows[0].mobile,
      roleTitle: "First-Timer",
      cellId: result.rows[0].cellId,
      dobMonth: result.rows[0].birthdayMonth || null,
      dobDay: result.rows[0].birthdayDay || null,
      address: result.rows[0].address,
      source: "first-timer-sync"
    });

    if (typeof isGraduate === "boolean") {
      await pool.query(
        `UPDATE members
         SET foundation_school = $1
         WHERE (LOWER(email) = LOWER($2))
            OR (LOWER(name) = LOWER($3) AND mobile IS NOT DISTINCT FROM $4)`,
        [isGraduate, result.rows[0].email || "", result.rows[0].name || "", result.rows[0].mobile || null]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update first-timer" });
  }
});

// FIRST-TIMER DECISION ACTIONS (PROTECTED)
app.put("/api/first-timers/:id/decision", requireAuth, requireStaff, async (req, res) => {
  try {
    const { action, cellId, departmentId } = req.body || {};
    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    const existing = await pool.query(
      `SELECT id::text as id, name, email, mobile, title, gender, source, cell_id::text as "cellId"
       FROM first_timers
       WHERE id = $1
       LIMIT 1`,
      [req.params.id]
    );
    if (!existing.rows.length) {
      return res.status(404).json({ error: "First-timer not found" });
    }
    const firstTimer = existing.rows[0];

    let updateSql = "";
    let updateParams = [];
    if (action === "archive") {
      updateSql = `UPDATE first_timers SET archived = TRUE WHERE id = $1`;
      updateParams = [req.params.id];
    } else if (action === "unarchive") {
      updateSql = `UPDATE first_timers SET archived = FALSE WHERE id = $1`;
      updateParams = [req.params.id];
    } else if (action === "assignCell") {
      if (!cellId) return res.status(400).json({ error: "cellId is required" });
      if (String(firstTimer.source || "").toLowerCase() === "cell") {
        return res.status(400).json({ error: "This first-timer already came from a cell" });
      }
      updateSql = `UPDATE first_timers SET cell_id = $1 WHERE id = $2`;
      updateParams = [cellId, req.params.id];
    } else if (action === "assignDepartment") {
      if (!departmentId) return res.status(400).json({ error: "departmentId is required" });
      updateSql = `UPDATE first_timers SET department_id = $1 WHERE id = $2`;
      updateParams = [departmentId, req.params.id];
    } else if (action === "assignFoundationSchool") {
      updateSql = `UPDATE first_timers SET in_foundation_school = TRUE, foundation_school = 'Yes' WHERE id = $1`;
      updateParams = [req.params.id];
    } else if (action === "graduate") {
      updateSql = `UPDATE first_timers
                   SET in_foundation_school = TRUE,
                       is_graduate = TRUE,
                       graduated_year = EXTRACT(YEAR FROM NOW())::int,
                       foundation_school = 'Yes'
                   WHERE id = $1`;
      updateParams = [req.params.id];
    } else if (action === "ungraduate") {
      updateSql = `UPDATE first_timers
                   SET is_graduate = FALSE,
                       graduated_year = NULL
                   WHERE id = $1`;
      updateParams = [req.params.id];
    } else {
      return res.status(400).json({ error: "Unsupported action" });
    }

    await pool.query(updateSql, updateParams);

    if (action === "assignCell" || action === "assignDepartment") {
      const targetCellId = action === "assignCell" ? cellId : (firstTimer.cellId || null);
      const targetDepartmentId = action === "assignDepartment" ? departmentId : null;
      const existingMember = await pool.query(
        `SELECT id
         FROM members
         WHERE LOWER(name) = LOWER($1)
           AND mobile IS NOT DISTINCT FROM $2
         LIMIT 1`,
        [firstTimer.name || "", firstTimer.mobile || null]
      );

      if (existingMember.rows.length) {
        await pool.query(
          `UPDATE members
           SET cell_id = COALESCE($1, cell_id),
               department_id = COALESCE($2, department_id),
               role = COALESCE(role, 'First-Timer')
           WHERE id = $3`,
          [targetCellId, targetDepartmentId, existingMember.rows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO members (cell_id, department_id, title, name, gender, mobile, email, role, joined_date, is_first_timer)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),TRUE)`,
          [
            targetCellId || null,
            targetDepartmentId || null,
            firstTimer.title || null,
            firstTimer.name || "",
            firstTimer.gender || null,
            firstTimer.mobile || null,
            firstTimer.email || null,
            "First-Timer"
          ]
        );
      }
    }

    if (action === "graduate" || action === "ungraduate") {
      await pool.query(
        `UPDATE members
         SET foundation_school = $1
         WHERE (LOWER(email) = LOWER($2))
            OR (LOWER(name) = LOWER($3) AND mobile IS NOT DISTINCT FROM $4)`,
        [action === "graduate", firstTimer.email || "", firstTimer.name || "", firstTimer.mobile || null]
      );
    }

    const result = await pool.query(
      `SELECT ft.id::text as id,
              ft.title,
              ft.name,
              ft.surname,
              ft.gender,
              ft.mobile,
              ft.email,
              ft.photo_data as "photoData",
              ft.address,
              ft.postcode,
              ft.date_joined as "dateJoined",
              ft.birthday_month as "birthdayMonth",
              ft.birthday_day as "birthdayDay",
              ft.age_group as "ageGroup",
              ft.marital_status as "maritalStatus",
              ft.born_again as "bornAgain",
              ft.speak_tongues as "speakTongues",
              COALESCE(ft.find_out, '[]'::jsonb) as "findOut",
              COALESCE(ft.contact_pref, '[]'::jsonb) as "contactPref",
              ft.visit,
              ft.visit_when as "visitWhen",
              COALESCE(ft.prayer_requests, '[]'::jsonb) as "prayerRequests",
              ft.status,
              ft.foundation_school as "foundationSchool",
              ft.foundation_class as "foundationClass",
              ft.exam_status as "examStatus",
              ft.graduation_date as "graduationDate",
              ft.graduated_year as "graduatedYear",
              COALESCE(ft.is_graduate, FALSE) as "isGraduate",
              ft.invited_by as "invitedBy",
              COALESCE(ft.archived, FALSE) as archived,
              COALESCE(ft.in_foundation_school, FALSE) as "inFoundationSchool",
              COALESCE(ft.source, 'manual') as source,
              ft.department_id::text as "departmentId",
              d.name as "departmentName",
              ft.cell_id::text as "cellId",
              c.name as "cellName"
       FROM first_timers ft
       LEFT JOIN cells c ON c.id = ft.cell_id
       LEFT JOIN departments d ON d.id = ft.department_id
       WHERE ft.id = $1`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to apply decision" });
  }
});

// DELETE FIRST-TIMER (PROTECTED)
app.delete("/api/first-timers/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM first_timers WHERE id = $1 RETURNING id::text as id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "First-timer not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete first-timer" });
  }
});

// GET FOLLOW-UP RECORDS (PROTECTED)
app.get("/api/follow-ups", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fu.id::text as id,
              fu.first_timer_id::text as "firstTimerId",
              ft.name as "firstTimerName",
              fu.followup_date as "date",
              fu.followup_time as "time",
              fu.comment,
              fu.visitation_arranged as "visitationArranged",
              fu.visitation_date as "visitationDate"
       FROM follow_ups fu
       LEFT JOIN first_timers ft ON ft.id = fu.first_timer_id
       ORDER BY fu.followup_date DESC NULLS LAST, fu.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load follow-up records" });
  }
});

// ADD FOLLOW-UP (PROTECTED)
app.post("/api/follow-ups", requireAuth, requireStaff, async (req, res) => {
  try {
    const { firstTimerId, date, time, comment, visitationArranged, visitationDate } = req.body;
    const result = await pool.query(
      `INSERT INTO follow_ups (first_timer_id, followup_date, followup_time, comment, visitation_arranged, visitation_date)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id::text as id,
                 first_timer_id::text as "firstTimerId",
                 followup_date as "date",
                 followup_time as "time",
                 comment,
                 visitation_arranged as "visitationArranged",
                 visitation_date as "visitationDate"`,
      [
        firstTimerId,
        date || null,
        time || null,
        comment || null,
        !!visitationArranged,
        visitationDate || null
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add follow-up record" });
  }
});

// UPDATE FOLLOW-UP (PROTECTED)
app.put("/api/follow-ups/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const { firstTimerId, date, time, comment, visitationArranged, visitationDate } = req.body;
    const result = await pool.query(
      `UPDATE follow_ups
       SET first_timer_id = COALESCE($1, first_timer_id),
           followup_date = COALESCE($2, followup_date),
           followup_time = COALESCE($3, followup_time),
           comment = COALESCE($4, comment),
           visitation_arranged = COALESCE($5, visitation_arranged),
           visitation_date = COALESCE($6, visitation_date)
       WHERE id = $7
       RETURNING id::text as id,
                 first_timer_id::text as "firstTimerId",
                 followup_date as "date",
                 followup_time as "time",
                 comment,
                 visitation_arranged as "visitationArranged",
                 visitation_date as "visitationDate"`,
      [
        firstTimerId ?? null,
        date ?? null,
        time ?? null,
        comment ?? null,
        typeof visitationArranged === "boolean" ? visitationArranged : null,
        visitationDate ?? null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Follow-up record not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update follow-up record" });
  }
});

// DELETE FOLLOW-UP (PROTECTED)
app.delete("/api/follow-ups/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM follow_ups WHERE id = $1 RETURNING id::text as id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Follow-up record not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete follow-up record" });
  }
});

// ADD REPORT (PROTECTED)
app.post("/api/reports", requireAuth, requireStaff, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["cellId", "date", "venue", "meetingType", "description", "attendees"])) return;
    const cellId = req.body?.cellId;
    const date = req.body?.date;
    const venue = safeString(req.body?.venue, 200);
    const meetingType = safeString(req.body?.meetingType, 80);
    const description = safeString(req.body?.description, 5000);
    const attendees = req.body?.attendees;
    if (!cellId || !date) {
      return res.status(400).json({ error: "Cell and date are required" });
    }
    if (meetingType && !allowedMeetingTypes.has(meetingType.toLowerCase())) {
      return res.status(400).json({ error: "Invalid meeting type" });
    }
    const normalizedAttendees = normalizeAttendeesInput(attendees);
    const attendeesJson = JSON.stringify(normalizedAttendees);

    const result = await pool.query(
      `INSERT INTO reports (cell_id, date, venue, meeting_type, description, attendees, report_date)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,($2::timestamptz)::date)
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 date,
                 venue,
                 meeting_type as "meetingType",
                 description,
                 attendees`,
      [cellId, date, venue, meetingType, description, attendeesJson]
    );

    const report = result.rows[0];
    try {
      await createNotification({
        title: "New Report Added",
        message: "A new report was added.",
        type: "info"
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add report" });
  }
});

// BIRTHDAYS (PROTECTED)
app.put("/api/birthdays/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const { birthday } = req.body || {};
    const parsed = parseMonthDay(birthday || "");
    if (!parsed.month || !parsed.day) {
      return res.status(400).json({ error: "Invalid birthday" });
    }

    const result = await pool.query(
      `UPDATE members
       SET dob_month = $1,
           dob_day = $2,
           date_of_birth = NULL
       WHERE id = $3
       RETURNING id::text as id,
                 name,
                 mobile,
                 dob_month as "dobMonth",
                 dob_day as "dobDay",
                 LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0') as "dateOfBirth"`,
      [parsed.month, parsed.day, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update birthday" });
  }
});

app.delete("/api/birthdays/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE members
       SET dob_month = NULL,
           dob_day = NULL,
           date_of_birth = NULL
       WHERE id = $1
       RETURNING id::text as id`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete birthday" });
  }
});

app.get("/api/birthdays/summary", requireAuth, async (req, res) => {
  try {
    const members = await pool.query(
      `SELECT id::text as id,
              cell_id::text as "cellId",
              name,
              role,
              mobile,
              dob_month as "dobMonth",
              dob_day as "dobDay",
              CASE
                WHEN dob_month IS NOT NULL AND dob_day IS NOT NULL
                  THEN LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0')
                WHEN date_of_birth IS NOT NULL
                  THEN TO_CHAR(date_of_birth, 'MM-DD')
                ELSE NULL
              END as "dateOfBirth"
       FROM members
       WHERE (dob_month IS NOT NULL AND dob_day IS NOT NULL)
          OR date_of_birth IS NOT NULL`
    );

    const today = new Date();
    const todayDay = today.getDate();
    const todayMonth = today.getMonth() + 1;
    const todaysBirthdays = members.rows.filter(member => {
      const parsed = parseMonthDay(member.dateOfBirth);
      return parsed.day === todayDay && parsed.month === todayMonth;
    });

    if (todaysBirthdays.length) {
      const notifyKey = `birthdays_today_${today.toISOString().slice(0, 10)}`;
      const notified = await pool.query(
        "SELECT value FROM app_settings WHERE key = $1",
        [notifyKey]
      );
      if (!notified.rows.length) {
        const names = todaysBirthdays.map(m => m.name).join(", ");
        await createNotification({
          title: "Birthdays Today",
          message: `Today is the birthday of: ${names}.`,
          type: "success"
        });
        await pool.query(
          `INSERT INTO app_settings (key, value)
           VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [notifyKey, "sent"]
        );
      }
    }

    // Upcoming birthdays (7 days before)
    const upcoming = members.rows
      .map(member => {
        const parsed = parseMonthDay(member.dateOfBirth);
        if (!parsed.month || !parsed.day) return null;
        let upcomingDate = new Date(today.getFullYear(), parsed.month - 1, parsed.day);
        if (upcomingDate < today) {
          upcomingDate.setFullYear(upcomingDate.getFullYear() + 1);
        }
        const diffDays = Math.floor((upcomingDate - today) / (1000 * 60 * 60 * 24));
        return { member, upcomingDate, diffDays };
      })
      .filter(item => item && item.diffDays === 7);

    for (const item of upcoming) {
      const key = `birthday_upcoming_${item.member.id}_${item.upcomingDate.toISOString().slice(0, 10)}`;
      const notified = await pool.query(
        "SELECT value FROM app_settings WHERE key = $1",
        [key]
      );
      if (notified.rows.length) continue;
      const dateLabel = item.upcomingDate.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short"
      });
      await createNotification({
        title: "Upcoming Birthday",
        message: `${item.member.name}'s birthday is on ${dateLabel}.`,
        type: "info"
      });
      await pool.query(
        `INSERT INTO app_settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, "sent"]
      );
    }

    const notifications = await pool.query(
      `SELECT id::text as id,
              user_id::text as "userId",
              title,
              message,
              type,
              created_at as "createdAt",
              read_at as "readAt"
       FROM notifications
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user.userId]
    );

    res.json({ members: members.rows, notifications: notifications.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load birthdays" });
  }
});

// UPDATE REPORT (PROTECTED)
app.put("/api/reports/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["date", "venue", "meetingType", "description", "attendees"])) return;
    const date = req.body?.date ?? null;
    const venue = req.body?.venue != null ? safeString(req.body.venue, 200) : null;
    const meetingType = req.body?.meetingType != null ? safeString(req.body.meetingType, 80) : null;
    const description = req.body?.description != null ? safeString(req.body.description, 5000) : null;
    const attendees = req.body?.attendees;
    if (meetingType && !allowedMeetingTypes.has(meetingType.toLowerCase())) {
      return res.status(400).json({ error: "Invalid meeting type" });
    }
    const normalizedAttendees = normalizeAttendeesInput(attendees);
    const attendeesJson = JSON.stringify(normalizedAttendees);
    const result = await pool.query(
      `UPDATE reports
       SET date = COALESCE($1, date),
           venue = COALESCE($2, venue),
           meeting_type = COALESCE($3, meeting_type),
           description = COALESCE($4, description),
           attendees = COALESCE($5::jsonb, attendees),
           report_date = COALESCE(($1::timestamptz)::date, report_date)
       WHERE id = $6
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 date,
                 venue,
                 meeting_type as "meetingType",
                 description,
                 attendees`,
      [date ?? null, venue ?? null, meetingType ?? null, description ?? null, attendeesJson, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    const report = result.rows[0];
    try {
      await createNotification({
        title: "Report Updated",
        message: "A report was updated.",
        type: "info"
      });
    } catch (err) {
      console.warn("Notification failed:", err.message);
    }

    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update report" });
  }
});

// NOTIFICATIONS (PROTECTED)
app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id::text as id,
              user_id::text as "userId",
              title,
              message,
              type,
              created_at as "createdAt",
              read_at as "readAt"
       FROM notifications
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

app.put("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || "").toLowerCase();
    const canManageGlobal = role === "superuser" || role === "admin";
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id = $1
         AND (user_id = $2 OR ($3 = TRUE AND user_id IS NULL))
       RETURNING id::text as id`,
      [req.params.id, req.user.userId, canManageGlobal]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark notification read" });
  }
});

app.put("/api/notifications/:id/unread", requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || "").toLowerCase();
    const canManageGlobal = role === "superuser" || role === "admin";
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = NULL
       WHERE id = $1
         AND (user_id = $2 OR ($3 = TRUE AND user_id IS NULL))
       RETURNING id::text as id`,
      [req.params.id, req.user.userId, canManageGlobal]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to mark notification unread" });
  }
});

app.put("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const role = String(req.user.role || "").toLowerCase();
    const canManageGlobal = role === "superuser" || role === "admin";
    await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE read_at IS NULL
         AND (user_id = $1 OR ($2 = TRUE AND user_id IS NULL))`,
      [req.user.userId, canManageGlobal]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

app.delete("/api/notifications", requireAuth, async (req, res) => {
  try {
    const { ids } = req.body || {};
    const list = Array.isArray(ids) ? ids.map(id => String(id)) : [];
    if (!list.length) {
      return res.status(400).json({ error: "No notifications selected" });
    }
    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id::text = ANY($1)
         AND (
           user_id = $2
           OR (
             user_id IS NULL
             AND ($3 = 'superuser' OR $3 = 'admin')
           )
         )
       RETURNING id::text as id`,
      [list, req.user.userId, String(req.user.role || "").toLowerCase()]
    );
    res.json({ deleted: result.rows.map(r => r.id) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete notifications" });
  }
});

app.post("/api/notifications/send", requireAuth, requireAdmin, async (req, res) => {
  try {
    if (!validateWritePayload(req, res, ["title", "message", "type", "roles", "targetIds", "usernames", "targetType", "targetValue"])) return;
    const { targetType, targetValue } = req.body || {};
    const title = safeString(req.body?.title, 200);
    const message = safeString(req.body?.message, 6000);
    const type = safeString(req.body?.type, 30) || "info";
    let roleList = Array.isArray(req.body?.roles) ? req.body.roles.map((role) => safeString(role, 80)).filter(Boolean) : [];
    let targetList = Array.isArray(req.body?.targetIds) ? req.body.targetIds.map((id) => String(id).trim()).filter(Boolean) : [];
    const usernameList = Array.isArray(req.body?.usernames) ? req.body.usernames.map((name) => safeString(name, 120)).filter(Boolean) : [];

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    if (targetType === "role" && targetValue) {
      roleList = [safeString(targetValue, 80)].filter(Boolean);
    }
    if (targetType === "individual" && targetValue) {
      const explicitId = String(targetValue).trim();
      if (explicitId) targetList.push(explicitId);
    }

    if (!roleList.length && !targetList.length && !usernameList.length) {
      return res.status(400).json({ error: "Select at least one role or username target" });
    }

    const targetingConfig = await getNotificationTargetingConfig();
    if (roleList.length && !targetingConfig.enableRoleTargeting) {
      return res.status(403).json({ error: "Role targeting is disabled in settings" });
    }
    if (usernameList.length && !targetingConfig.enableUsernameTargeting) {
      return res.status(403).json({ error: "Username targeting is disabled in settings" });
    }

    const allowedRoleSet = new Set(
      (targetingConfig.allowedRoles || []).map((role) => String(role).trim().toLowerCase()).filter(Boolean)
    );
    if (allowedRoleSet.size) {
      const disallowed = roleList.find((role) => !allowedRoleSet.has(String(role).trim().toLowerCase()));
      if (disallowed) {
        return res.status(403).json({ error: `Role "${disallowed}" is not allowed for notification targeting` });
      }
    }

    const userIds = [];
    if (targetList.length) {
      const directUsers = await pool.query(
        `SELECT id::text as id
         FROM users
         WHERE id::text = ANY($1)`,
        [Array.from(new Set(targetList))]
      );
      userIds.push(...directUsers.rows.map((row) => row.id));
    }

    if (usernameList.length) {
      const usernamesNormalized = Array.from(
        new Set(usernameList.map((name) => String(name).trim().toLowerCase()).filter(Boolean))
      );
      const usernameUsers = await pool.query(
        `SELECT id::text as id
         FROM users
         WHERE LOWER(username) = ANY($1)`,
        [usernamesNormalized]
      );
      userIds.push(...usernameUsers.rows.map((row) => row.id));
    }

    if (roleList.length) {
      const roleUsers = await pool.query(
        `SELECT DISTINCT u.id::text as id
         FROM users u
         WHERE u.role = ANY($1)
         UNION
         SELECT DISTINCT u2.id::text as id
         FROM members m
         JOIN users u2 ON LOWER(u2.email) = LOWER(m.email)
         WHERE m.role = ANY($1)`,
        [Array.from(new Set(roleList))]
      );
      userIds.push(...roleUsers.rows.map((row) => row.id));
    }

    const uniqueUserIds = Array.from(new Set(userIds.map((id) => String(id).trim()).filter(Boolean)));
    if (!uniqueUserIds.length) {
      return res.status(404).json({ error: "No users found for selected target(s)" });
    }

    for (const userId of uniqueUserIds) {
      await createNotification({
        title,
        message,
        type,
        userId
      });
    }

    res.json({ ok: true, recipients: uniqueUserIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send notification" });
  }
});

// DELETE REPORT (PROTECTED)
app.delete("/api/reports/:id", requireAuth, requireStaff, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM reports WHERE id = $1 RETURNING id::text as id",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete report" });
  }
});

// React app (served at /)
app.get(/^\/app(\/.*)?$/, (req, res) => {
  res.redirect("/");
});

app.get(/^\/(?!api\/|old\/).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, "index.html"));
});

// Redirect any remaining routes to React app
app.get(/.*/, (req, res) => {
  res.redirect("/");
});

// ===============================
// 7) START SERVER (ALWAYS LAST)
// ===============================
ensureUserProfilesSchema()
  .then(() => ensureFirstTimerSchema())
  .then(() => ensureSecuritySchema())
  .then(() => seedProfilesForExistingUsers())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Startup schema check failed:", err);
    process.exit(1);
  });



