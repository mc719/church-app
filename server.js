const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5050;

// Middleware
app.use(express.json());
app.use(express.static("public"));

// Database connection (Render will give us this later)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test route
app.get("/api/test", async (req, res) => {
  res.json({ message: "Server is working 🎉" });
});

// Serve HTML
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});



// add a cell
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.post("/api/cells", async (req, res) => {
  const { name, venue, day, time, description } = req.body;

  const result = await pool.query(
    "INSERT INTO cells (name, venue, day, time, description) VALUES ($1,$2,$3,$4,$5) RETURNING *",
    [name, venue, day, time, description]
  );

  res.json(result.rows[0]);
});
