// ===============================
// 1) IMPORTS
// ===============================
const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();

// ===============================
// 2) CREATE APP
// ===============================
const app = express();
const PORT = process.env.PORT || 5050;

// ===============================
// 3) GLOBAL MIDDLEWARE
// ===============================
app.use(express.json());
app.use(express.static("public"));

// ===============================
// 4) DATABASE CONNECTION
// ===============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

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

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next(); // allow request to continue
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAuthOrAccessCode(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  const accessCode = normalizeAccessCode(req.headers["x-access-code"]);
  const expectedAccessCode = normalizeAccessCode(ACCESS_CODE);

  if (!expectedAccessCode) {
    return res.status(403).json({ error: "Access code not configured" });
  }

  if (accessCode && accessCode === expectedAccessCode) {
    return next();
  }

  if (!token) {
    return res.status(401).json({ error: "Missing token or access code" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.post("/api/access/verify", (req, res) => {
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

function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (role !== "superuser" && role !== "admin") {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}

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
       ADD COLUMN IF NOT EXISTS surname TEXT,
       ADD COLUMN IF NOT EXISTS gender TEXT,
       ADD COLUMN IF NOT EXISTS address TEXT,
       ADD COLUMN IF NOT EXISTS postcode TEXT,
       ADD COLUMN IF NOT EXISTS email TEXT,
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
       ADD COLUMN IF NOT EXISTS prayer_requests JSONB DEFAULT '[]'::jsonb`
  );

  await pool.query(
    `ALTER TABLE members
       ADD COLUMN IF NOT EXISTS dob_month SMALLINT,
       ADD COLUMN IF NOT EXISTS dob_day SMALLINT`
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
    `CREATE TABLE IF NOT EXISTS user_profiles (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
       email TEXT NOT NULL,
       username TEXT,
       full_name TEXT,
       phone TEXT,
       role_title TEXT,
       cell_id INTEGER REFERENCES cells(id) ON DELETE SET NULL,
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
       ADD COLUMN IF NOT EXISTS cell_id INTEGER REFERENCES cells(id) ON DELETE SET NULL,
       ADD COLUMN IF NOT EXISTS dob_month SMALLINT,
       ADD COLUMN IF NOT EXISTS dob_day SMALLINT,
       ADD COLUMN IF NOT EXISTS address TEXT,
       ADD COLUMN IF NOT EXISTS photo_data TEXT,
       ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'system',
       ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
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

async function syncProfileByEmail({ email, fullName = null, phone = null, roleTitle = null, cellId = null, dobMonth = null, dobDay = null, address = null, source = "member-sync" }) {
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
         dob_month = COALESCE($5, dob_month),
         dob_day = COALESCE($6, dob_day),
         address = COALESCE($7, address),
         source = COALESCE($8, source),
         updated_at = NOW()
     WHERE user_id = $9`,
    [fullName, phone, roleTitle, cellId, dobMonth, dobDay, address, source, user.id]
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
    const { logo } = req.body || {};
    if (!logo) {
      return res.status(400).json({ error: "Logo is required" });
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
app.get("/api/test", (req, res) => {
  res.json({ message: "Server is working 🎉" });
});

// OTP SEND (PUBLIC) - by email
app.post("/api/otp/send", rateLimit({ keyPrefix: "otp-send", windowMs: 60_000, max: 5 }), async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

  const result = await pool.query(
    "SELECT id, username, role, status, email, restricted_menus FROM users WHERE email = $1",
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

  const token = jwt.sign(
    { userId: user.id, role: user.role, username: user.username },
    JWT_SECRET,
    { expiresIn: "8h" }
  );

  const sessionId = await createSession(user.id, req);

  res.json({
    token,
    sessionId,
    username: user.username,
    role: user.role,
    restrictedMenus: user.restricted_menus || []
  });
});

// LOGIN ROUTE (PUBLIC)
app.post("/api/login", rateLimit({ keyPrefix: "login", windowMs: 60_000, max: 10 }), async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT id, username, password_hash, role, status, restricted_menus FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = result.rows[0];

    if (!user.status) {
      return res.status(403).json({ error: "Account disabled" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    const sessionId = await createSession(user.id, req);

    res.json({
      token,
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
app.post("/api/cells", requireAuthOrAccessCode, async (req, res) => {
  try {
    const { name, venue, day, time, description } = req.body;

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

// USERS (PROTECTED, ADMIN ONLY)
app.get("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id::text as id,
              username,
              email,
              role,
              status,
              restricted_menus as "restrictedMenus"
       FROM users
       ORDER BY id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load users" });
  }
});

app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, email, role, status, restrictedMenus } = req.body;

    if (!username || !password || !email || !role) {
      return res.status(400).json({ error: "Username, email, password, and role are required" });
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add user" });
  }
});

app.put("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, email, role, status, restrictedMenus } = req.body;

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    const restrictedMenusJson = restrictedMenus ? JSON.stringify(restrictedMenus) : null;

    const result = await pool.query(
      `UPDATE users
       SET username = COALESCE($1, username),
           email = COALESCE($2, email),
           password_hash = COALESCE($3, password_hash),
           role = COALESCE($4, role),
           status = COALESCE($5, status),
           restricted_menus = COALESCE($6, restricted_menus)
       WHERE id = $7
       RETURNING id::text as id, username, email, role, status, restricted_menus as "restrictedMenus"`,
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

    const result = await pool.query(
      `SELECT up.id::text as id,
              up.user_id::text as "userId",
              up.email,
              up.username,
              up.full_name as "fullName",
              up.phone,
              up.role_title as "roleTitle",
              up.cell_id::text as "cellId",
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
       WHERE up.user_id = $1
       LIMIT 1`,
      [req.user.userId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put("/api/profile/me", requireAuth, async (req, res) => {
  try {
    const { fullName, phone, roleTitle, cellId, dateOfBirth, address, photoData } = req.body || {};
    const parsedDob = parseMonthDay(dateOfBirth);

    const result = await pool.query(
      `UPDATE user_profiles
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           role_title = COALESCE($3, role_title),
           cell_id = COALESCE($4, cell_id),
           dob_month = COALESCE($5, dob_month),
           dob_day = COALESCE($6, dob_day),
           address = COALESCE($7, address),
           photo_data = COALESCE($8, photo_data),
           source = 'self',
           updated_at = NOW()
       WHERE user_id = $9
       RETURNING id::text as id,
                 user_id::text as "userId",
                 email,
                 username,
                 full_name as "fullName",
                 phone,
                 role_title as "roleTitle",
                 cell_id::text as "cellId",
                 dob_month as "dobMonth",
                 dob_day as "dobDay",
                 CASE
                   WHEN dob_month IS NOT NULL AND dob_day IS NOT NULL
                     THEN LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0')
                   ELSE NULL
                 END as "dateOfBirth",
                 address,
                 photo_data as "photoData",
                 source,
                 updated_at as "updatedAt"`,
      [fullName ?? null, phone ?? null, roleTitle ?? null, cellId ?? null, parsedDob.month, parsedDob.day, address ?? null, photoData ?? null, req.user.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.get("/api/profiles/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT up.id::text as id,
              up.user_id::text as "userId",
              up.email,
              up.username,
              up.full_name as "fullName",
              up.phone,
              up.role_title as "roleTitle",
              up.cell_id::text as "cellId",
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
       WHERE up.user_id = $1
       LIMIT 1`,
      [req.params.userId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put("/api/profiles/:userId", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { fullName, phone, roleTitle, cellId, dateOfBirth, address, photoData } = req.body || {};
    const parsedDob = parseMonthDay(dateOfBirth);

    const result = await pool.query(
      `UPDATE user_profiles
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           role_title = COALESCE($3, role_title),
           cell_id = COALESCE($4, cell_id),
           dob_month = COALESCE($5, dob_month),
           dob_day = COALESCE($6, dob_day),
           address = COALESCE($7, address),
           photo_data = COALESCE($8, photo_data),
           source = 'manual',
           updated_at = NOW()
       WHERE user_id = $9
       RETURNING id::text as id,
                 user_id::text as "userId",
                 email,
                 username,
                 full_name as "fullName",
                 phone,
                 role_title as "roleTitle",
                 cell_id::text as "cellId",
                 dob_month as "dobMonth",
                 dob_day as "dobDay",
                 CASE
                   WHEN dob_month IS NOT NULL AND dob_day IS NOT NULL
                     THEN LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0')
                   ELSE NULL
                 END as "dateOfBirth",
                 address,
                 photo_data as "photoData",
                 source,
                 updated_at as "updatedAt"`,
      [fullName ?? null, phone ?? null, roleTitle ?? null, cellId ?? null, parsedDob.month, parsedDob.day, address ?? null, photoData ?? null, req.params.userId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Profile not found" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
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

app.put("/api/sessions/:id/end", requireAuth, async (req, res) => {
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

app.put("/api/sessions/:id/metrics", requireAuth, async (req, res) => {
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
app.put("/api/cells/:id", requireAuth, async (req, res) => {
  try {
    const { name, venue, day, time, description } = req.body;
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
app.delete("/api/cells/:id", requireAuth, async (req, res) => {
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
      `SELECT id::text as id,
              cell_id::text as "cellId",
              title,
              name,
              gender,
              mobile,
              email,
              role,
              is_first_timer as "isFirstTimer",
              dob_month as "dobMonth",
              dob_day as "dobDay",
              CASE
                WHEN dob_month IS NOT NULL AND dob_day IS NOT NULL
                  THEN LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0')
                WHEN date_of_birth IS NOT NULL
                  THEN TO_CHAR(date_of_birth, 'MM-DD')
                ELSE NULL
              END as "dateOfBirth",
              joined_date as "joinedDate"
       FROM members
       ORDER BY id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load members" });
  }
});

// ADD MEMBER (AUTH OR ACCESS CODE)
app.post("/api/members", requireAuthOrAccessCode, async (req, res) => {
  try {
    const { cellId, title, name, gender, mobile, email, role, isFirstTimer, dateOfBirth, dobMonth, dobDay } = req.body;
    const parsedDob = parseMonthDay(dateOfBirth || (dobMonth && dobDay ? `${dobMonth}-${dobDay}` : ""));

    const result = await pool.query(
      `INSERT INTO members (cell_id, title, name, gender, mobile, email, role, is_first_timer, dob_month, dob_day, date_of_birth, joined_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL, NOW())
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 is_first_timer as "isFirstTimer",
                 dob_month as "dobMonth",
                 dob_day as "dobDay",
                 CASE
                   WHEN dob_month IS NOT NULL AND dob_day IS NOT NULL
                     THEN LPAD(dob_month::text, 2, '0') || '-' || LPAD(dob_day::text, 2, '0')
                   ELSE NULL
                 END as "dateOfBirth",
                 joined_date as "joinedDate"`,
      [cellId, title, name, gender, mobile, email, role, !!isFirstTimer, parsedDob.month, parsedDob.day]
    );

    const member = result.rows[0];

    await syncProfileByEmail({
      email: member.email,
      fullName: member.name,
      phone: member.mobile,
      roleTitle: member.role,
      cellId: member.cellId,
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
          `INSERT INTO first_timers (name, mobile, date_joined, status, foundation_school, cell_id, invited_by)
           VALUES ($1,$2,NOW(),$3,$4,$5,$6)`,
          [name, mobile || null, "amber", "Not Yet", cellId || null, null]
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
app.put("/api/members/:id", requireAuth, async (req, res) => {
  try {
    const { title, name, gender, mobile, email, role, isFirstTimer, dateOfBirth, dobMonth, dobDay } = req.body;
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
           is_first_timer = COALESCE($7, is_first_timer),
           dob_month = COALESCE($8, dob_month),
           dob_day = COALESCE($9, dob_day),
           date_of_birth = NULL
       WHERE id = $10
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 is_first_timer as "isFirstTimer",
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
        typeof isFirstTimer === "boolean" ? isFirstTimer : null,
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
          `INSERT INTO first_timers (name, mobile, date_joined, status, foundation_school, cell_id, invited_by)
           VALUES ($1,$2,NOW(),$3,$4,$5,$6)`,
          [member.name, member.mobile || null, "amber", "Not Yet", member.cellId || null, null]
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
app.delete("/api/members/:id", requireAuth, async (req, res) => {
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
    const result = await pool.query(
      `SELECT ft.id::text as id,
              ft.name,
              ft.surname,
              ft.gender,
              ft.mobile,
              ft.email,
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
              ft.invited_by as "invitedBy",
              ft.cell_id::text as "cellId",
              c.name as "cellName"
       FROM first_timers ft
       LEFT JOIN cells c ON c.id = ft.cell_id
       ORDER BY ft.date_joined DESC NULLS LAST, ft.id DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load first-timers" });
  }
});

// ADD FIRST-TIMER (PROTECTED OR ACCESS CODE)
app.post("/api/first-timers", requireAuthOrAccessCode, async (req, res) => {
  try {
    const {
      name,
      surname,
      gender,
      mobile,
      email,
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
      cellId,
      invitedBy
    } = req.body || {};

    const parsedBirthday = parseMonthDay(birthday);
    const safeFindOut = toTextArray(findOut);
    const safeContactPref = toTextArray(contactPref);
    const safePrayerRequests = toTextArray(prayerRequests);

    const existing = await pool.query(
      `SELECT ft.id::text as id,
              ft.name,
              ft.surname,
              ft.gender,
              ft.mobile,
              ft.email,
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
              ft.invited_by as "invitedBy",
              ft.cell_id::text as "cellId",
              c.name as "cellName"
       FROM first_timers ft
       LEFT JOIN cells c ON c.id = ft.cell_id
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
         name, surname, gender, mobile, email, address, postcode,
         birthday_month, birthday_day, age_group, marital_status, born_again, speak_tongues,
         find_out, contact_pref, visit, visit_when, prayer_requests,
         date_joined, status, foundation_school, cell_id, invited_by
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,$18::jsonb,$19,$20,$21,$22,$23)
       RETURNING id::text as id,
                 name,
                 surname,
                 gender,
                 mobile,
                 email,
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
                 invited_by as "invitedBy",
                 cell_id::text as "cellId"`,
      [
        name,
        surname || null,
        gender || null,
        mobile || null,
        email || null,
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
        cellId || null,
        invitedBy || null
      ]
    );

    // If a cell is selected, add to members list as First-Timer
    if (cellId) {
      await pool.query(
        `INSERT INTO members (cell_id, title, name, gender, mobile, email, role, joined_date, is_first_timer)
         VALUES ($1,$2,$3,$4,$5,$6,$7, NOW(), TRUE)`,
        [cellId, "First-Timer", name, "Unknown", mobile || "", null, "First-Timer"]
      );
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add first-timer" });
  }
});

// UPDATE FIRST-TIMER (PROTECTED)
app.put("/api/first-timers/:id", requireAuth, async (req, res) => {
  try {
    const {
      name,
      surname,
      gender,
      mobile,
      email,
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
      cellId,
      invitedBy
    } = req.body || {};

    const parsedBirthday = parseMonthDay(birthday);
    const safeFindOut = toTextArray(findOut);
    const safeContactPref = toTextArray(contactPref);
    const safePrayerRequests = toTextArray(prayerRequests);

    const result = await pool.query(
      `UPDATE first_timers
       SET name = COALESCE($1, name),
           surname = COALESCE($2, surname),
           gender = COALESCE($3, gender),
           mobile = COALESCE($4, mobile),
           email = COALESCE($5, email),
           address = COALESCE($6, address),
           postcode = COALESCE($7, postcode),
           birthday_month = COALESCE($8, birthday_month),
           birthday_day = COALESCE($9, birthday_day),
           age_group = COALESCE($10, age_group),
           marital_status = COALESCE($11, marital_status),
           born_again = COALESCE($12, born_again),
           speak_tongues = COALESCE($13, speak_tongues),
           find_out = COALESCE($14::jsonb, find_out),
           contact_pref = COALESCE($15::jsonb, contact_pref),
           visit = COALESCE($16, visit),
           visit_when = COALESCE($17, visit_when),
           prayer_requests = COALESCE($18::jsonb, prayer_requests),
           date_joined = COALESCE($19, date_joined),
           status = COALESCE($20, status),
           foundation_school = COALESCE($21, foundation_school),
           cell_id = COALESCE($22, cell_id),
           invited_by = COALESCE($23, invited_by)
       WHERE id = $24
       RETURNING id::text as id,
                 name,
                 surname,
                 gender,
                 mobile,
                 email,
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
                 invited_by as "invitedBy",
                 cell_id::text as "cellId"`,
      [
        name ?? null,
        surname ?? null,
        gender ?? null,
        mobile ?? null,
        email ?? null,
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
        cellId ?? null,
        invitedBy ?? null,
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update first-timer" });
  }
});

// DELETE FIRST-TIMER (PROTECTED)
app.delete("/api/first-timers/:id", requireAuth, async (req, res) => {
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
app.post("/api/follow-ups", requireAuth, async (req, res) => {
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
app.put("/api/follow-ups/:id", requireAuth, async (req, res) => {
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
app.delete("/api/follow-ups/:id", requireAuth, async (req, res) => {
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
app.post("/api/reports", requireAuth, async (req, res) => {
  try {
    const { cellId, date, venue, meetingType, description, attendees } = req.body;

    const result = await pool.query(
      `INSERT INTO reports (cell_id, date, venue, meeting_type, description, attendees, report_date)
       VALUES ($1,$2,$3,$4,$5,$6,($2::timestamptz)::date)
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 date,
                 venue,
                 meeting_type as "meetingType",
                 description,
                 attendees`,
      [cellId, date, venue, meetingType, description, attendees || []]
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
app.put("/api/reports/:id", requireAuth, async (req, res) => {
  try {
    const { date, venue, meetingType, description, attendees } = req.body;
    const result = await pool.query(
      `UPDATE reports
       SET date = COALESCE($1, date),
           venue = COALESCE($2, venue),
           meeting_type = COALESCE($3, meeting_type),
           description = COALESCE($4, description),
           attendees = COALESCE($5, attendees),
           report_date = COALESCE(($1::timestamptz)::date, report_date)
       WHERE id = $6
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 date,
                 venue,
                 meeting_type as "meetingType",
                 description,
                 attendees`,
      [date ?? null, venue ?? null, meetingType ?? null, description ?? null, attendees ?? null, req.params.id]
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
    const result = await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE id = $1
         AND (user_id IS NULL OR user_id = $2)
       RETURNING id::text as id`,
      [req.params.id, req.user.userId]
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

app.put("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE read_at IS NULL
         AND (user_id IS NULL OR user_id = $1)`,
      [req.user.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

app.post("/api/notifications/send", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { targetType, targetValue, title, message, type, roles, targetIds } = req.body || {};

    if (!title || !message) {
      return res.status(400).json({ error: "Title and message are required" });
    }

    let userIds = [];

    if (Array.isArray(targetIds) || Array.isArray(roles)) {
      const roleList = Array.isArray(roles) ? roles.filter(Boolean) : [];
      const targetList = Array.isArray(targetIds) ? targetIds.filter(Boolean) : [];

      if (!roleList.length && !targetList.length) {
        return res.status(400).json({ error: "Select at least one role or target" });
      }

      if (targetList.length) {
        const result = await pool.query(
          `SELECT id
           FROM users
           WHERE id::text = ANY($1)`,
          [targetList]
        );
        userIds = result.rows.map(r => r.id);
      } else if (roleList.length) {
        const result = await pool.query(
          `SELECT DISTINCT u.id
           FROM users u
           WHERE u.role = ANY($1)
           UNION
           SELECT DISTINCT u2.id
           FROM members m
           JOIN users u2 ON u2.email = m.email
           WHERE m.role = ANY($1)`,
          [roleList]
        );
        userIds = result.rows.map(r => r.id);
      }
    } else {
      if (!targetType) {
        return res.status(400).json({ error: "Target type is required" });
      }

      if (targetType === "individual") {
        const result = await pool.query("SELECT id FROM users WHERE id = $1", [targetValue]);
        userIds = result.rows.map(r => r.id);
      } else if (targetType === "role") {
        const result = await pool.query("SELECT id FROM users WHERE role = $1", [targetValue]);
        userIds = result.rows.map(r => r.id);
      } else if (targetType === "title") {
        const result = await pool.query(
          `SELECT u.id
           FROM members m
           JOIN users u ON u.email = m.email
           WHERE m.title = $1`,
          [targetValue]
        );
        userIds = result.rows.map(r => r.id);
      } else if (targetType === "group") {
        const result = await pool.query(
          `SELECT u.id
           FROM members m
           JOIN users u ON u.email = m.email
           WHERE m.cell_id = $1`,
          [targetValue]
        );
        userIds = result.rows.map(r => r.id);
      } else {
        return res.status(400).json({ error: "Unsupported target type" });
      }
    }

    const uniqueUserIds = Array.from(new Set(userIds.map(id => id?.toString()).filter(Boolean)));
    if (!uniqueUserIds.length) {
      return res.status(404).json({ error: "No users found for target" });
    }

    for (const userId of uniqueUserIds) {
      await createNotification({
        title,
        message,
        type: type || "info",
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
app.delete("/api/reports/:id", requireAuth, async (req, res) => {
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

// Serve HTML LAST
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ===============================
// 7) START SERVER (ALWAYS LAST)
// ===============================
ensureFirstTimerSchema()
  .then(() => ensureUserProfilesSchema())
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
