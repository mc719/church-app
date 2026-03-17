/* eslint-disable no-console */
const BASE_URL = (process.env.BASE_URL || "http://localhost:5050").replace(/\/+$/, "");
const TEST_USERNAME = process.env.TEST_USERNAME || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";
const CORS_ORIGINS = process.env.CORS_ORIGINS || "";

function ok(label, message) {
  console.log(`PASS: ${label}${message ? ` - ${message}` : ""}`);
}

function fail(label, message) {
  console.error(`FAIL: ${label}${message ? ` - ${message}` : ""}`);
}

function skip(label, message) {
  console.log(`SKIP: ${label}${message ? ` - ${message}` : ""}`);
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

async function login() {
  if (!TEST_USERNAME || !TEST_PASSWORD) return null;
  const { res, json } = await request("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD })
  });
  if (!res.ok || !json?.token) return null;
  return json.token;
}

async function run() {
  let failed = 0;

  // 1) Unauthorized write should be blocked.
  {
    const { res } = await request("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cellId: "1", date: new Date().toISOString() })
    });
    if (res.status === 401 || res.status === 403) ok("unauthorized-write");
    else {
      failed += 1;
      fail("unauthorized-write", `expected 401/403, got ${res.status}`);
    }
  }

  // 2) CORS blocked origin should return 403 (when CORS_ORIGINS configured).
  {
    if (!CORS_ORIGINS) {
      skip("cors-block", "CORS_ORIGINS not set in test env");
    } else {
      const { res, json } = await request("/api/health", {
        headers: { Origin: "https://evil.example" }
      });
      if (res.status === 403 && json?.error) ok("cors-block");
      else {
        failed += 1;
        fail("cors-block", `expected 403 JSON, got ${res.status}`);
      }
    }
  }

  const token = await login();
  if (!token) {
    skip("auth-dependent-tests", "TEST_USERNAME/TEST_PASSWORD missing or invalid");
  } else {
    // 3) Unknown field payload should be rejected.
    {
      const { res } = await request("/api/profile/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ unknownField: "x" })
      });
      if (res.status === 400) ok("unknown-field-rejected");
      else {
        failed += 1;
        fail("unknown-field-rejected", `expected 400, got ${res.status}`);
      }
    }

    // 4) Oversize image upload should be rejected.
    {
      const oversized = `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`;
      const { res } = await request("/api/profile/me", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ photoData: oversized })
      });
      if (res.status === 400) ok("oversize-image-rejected");
      else {
        failed += 1;
        fail("oversize-image-rejected", `expected 400, got ${res.status}`);
      }
    }
  }

  if (failed > 0) {
    console.error(`\nSecurity smoke tests failed: ${failed}`);
    process.exit(1);
  }
  console.log("\nSecurity smoke tests passed.");
}

run().catch((err) => {
  console.error("Security smoke test runner failed:", err);
  process.exit(1);
});

