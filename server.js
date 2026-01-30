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

// ===============================
// 5) AUTH MIDDLEWARE (PASTE HERE)
// ===============================
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-secret";
const ACCESS_CODE = process.env.ACCESS_CODE || "";

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
  const accessCode = req.headers["x-access-code"];

  if (!ACCESS_CODE) {
    return res.status(403).json({ error: "Access code not configured" });
  }

  if (accessCode && accessCode === ACCESS_CODE) {
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
  const { accessCode } = req.body || {};
  if (!ACCESS_CODE) {
    return res.status(403).json({ error: "Access code not configured" });
  }
  if (!accessCode) {
    return res.status(400).json({ error: "Access code required" });
  }
  if (accessCode !== ACCESS_CODE) {
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

    res.json(result.rows[0]);
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

// GET CELLS (PROTECTED)
app.get("/api/cells", requireAuth, async (req, res) => {
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

    res.json(result.rows[0]);
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
    const { cellId, title, name, gender, mobile, email, role, isFirstTimer } = req.body;

    const result = await pool.query(
      `INSERT INTO members (cell_id, title, name, gender, mobile, email, role, is_first_timer, joined_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, NOW())
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 is_first_timer as "isFirstTimer",
                 joined_date as "joinedDate"`,
      [cellId, title, name, gender, mobile, email, role, !!isFirstTimer]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add member" });
  }
});

// UPDATE MEMBER (PROTECTED)
app.put("/api/members/:id", requireAuth, async (req, res) => {
  try {
    const { title, name, gender, mobile, email, role, isFirstTimer } = req.body;
    const result = await pool.query(
      `UPDATE members
       SET title = COALESCE($1, title),
           name = COALESCE($2, name),
           gender = COALESCE($3, gender),
           mobile = COALESCE($4, mobile),
           email = COALESCE($5, email),
           role = COALESCE($6, role),
           is_first_timer = COALESCE($7, is_first_timer)
       WHERE id = $8
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 is_first_timer as "isFirstTimer",
                 joined_date as "joinedDate"`,
      [
        title ?? null,
        name ?? null,
        gender ?? null,
        mobile ?? null,
        email ?? null,
        role ?? null,
        typeof isFirstTimer === "boolean" ? isFirstTimer : null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Member not found" });
    }

    res.json(result.rows[0]);
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add report" });
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update report" });
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
