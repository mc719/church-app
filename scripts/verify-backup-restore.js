const { Pool } = require("pg");
require("dotenv").config();

const TABLES = ["users", "members", "first_timers", "reports", "audit_logs"];

function poolFrom(url) {
  return new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
}

async function countTables(pool) {
  const counts = {};
  for (const table of TABLES) {
    const result = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${table}`);
    counts[table] = Number(result.rows[0].count || 0);
  }
  return counts;
}

async function main() {
  const sourceUrl = process.env.DATABASE_URL;
  const restoredUrl = process.env.RESTORED_DATABASE_URL;
  if (!sourceUrl || !restoredUrl) {
    throw new Error("DATABASE_URL and RESTORED_DATABASE_URL are required");
  }

  const sourcePool = poolFrom(sourceUrl);
  const restoredPool = poolFrom(restoredUrl);
  try {
    const [source, restored] = await Promise.all([
      countTables(sourcePool),
      countTables(restoredPool)
    ]);

    const summary = TABLES.map((table) => ({
      table,
      source: source[table],
      restored: restored[table],
      delta: restored[table] - source[table]
    }));

    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), summary }, null, 2));
  } finally {
    await sourcePool.end();
    await restoredPool.end();
  }
}

main().catch((err) => {
  console.error("Backup verification failed:", err.message);
  process.exit(1);
});

