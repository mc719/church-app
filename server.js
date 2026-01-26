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
    `INSERT INTO sessions (user_id, login_time, ip_address, user_agent)
     VALUES ($1, NOW(), $2, $3)
     RETURNING id::text as id`,
    [userId, ipAddress, userAgent]
  );
  return result.rows[0]?.id || null;
}

// ===============================
// 6) ROUTES
// ===============================

// Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Server is working 🎉" });
});

// OTP SEND (PUBLIC) - by email
app.post("/api/otp/send", async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const result = await pool.query(
      "SELECT id, username, role, status, email FROM users WHERE email = $1",
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
app.post("/api/otp/login", async (req, res) => {
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
    role: user.role
  });
});

// LOGIN ROUTE (PUBLIC)
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      "SELECT id, username, password_hash, role, status FROM users WHERE username = $1",
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
      role: user.role
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADD CELL (PROTECTED)
app.post("/api/cells", requireAuth, async (req, res) => {
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
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role, status, restricted_menus)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id::text as id, username, email, role, status, restricted_menus as "restrictedMenus"`,
      [username, email, passwordHash, role, status ?? true, restrictedMenus || []]
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
        restrictedMenus ?? null,
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

// ADD MEMBER (PROTECTED)
app.post("/api/members", requireAuth, async (req, res) => {
  try {
    const { cellId, title, name, gender, mobile, email, role } = req.body;

    const result = await pool.query(
      `INSERT INTO members (cell_id, title, name, gender, mobile, email, role, joined_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 joined_date as "joinedDate"`,
      [cellId, title, name, gender, mobile, email, role]
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
    const { title, name, gender, mobile, email, role } = req.body;
    const result = await pool.query(
      `UPDATE members
       SET title = COALESCE($1, title),
           name = COALESCE($2, name),
           gender = COALESCE($3, gender),
           mobile = COALESCE($4, mobile),
           email = COALESCE($5, email),
           role = COALESCE($6, role)
       WHERE id = $7
       RETURNING id::text as id,
                 cell_id::text as "cellId",
                 title,
                 name,
                 gender,
                 mobile,
                 email,
                 role,
                 joined_date as "joinedDate"`,
      [
        title ?? null,
        name ?? null,
        gender ?? null,
        mobile ?? null,
        email ?? null,
        role ?? null,
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
       VALUES ($1,$2,$3,$4,$5,$6,$2)
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
