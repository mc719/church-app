const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id SERIAL PRIMARY KEY,
         filename TEXT UNIQUE NOT NULL,
         applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       )`
    );

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const filename of files) {
      const already = await pool.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1",
        [filename]
      );
      if (already.rows.length) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
      await pool.query("BEGIN");
      try {
        await pool.query(sql);
        await pool.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename]
        );
        await pool.query("COMMIT");
        console.log(`Applied migration: ${filename}`);
      } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
      }
    }

    console.log("Migrations complete");
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

