/* eslint-disable no-console */
const BASE_URL = (process.env.BASE_URL || "http://localhost:5050").replace(/\/+$/, "");
const TEST_USERNAME = process.env.TEST_USERNAME || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";
const CORS_ORIGINS = process.env.CORS_ORIGINS || "";
const OTP_KNOWN_EMAIL = process.env.SECURITY_TEST_EMAIL || "";
const OTP_UNKNOWN_EMAIL = process.env.SECURITY_TEST_FAKE_EMAIL || `missing-${Date.now()}@example.invalid`;

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

function hasGenericOtpResponse(payload) {
  return payload && typeof payload.message === "string" && payload.message.toLowerCase().includes("one-time code");
}

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
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

  // 2) Protected reads should be blocked without auth.
  for (const path of ["/api/cells", "/api/members", "/api/first-timers"]) {
    const { res } = await request(path);
    if (res.status === 401 || res.status === 403) ok(`protected-read${path}`);
    else {
      failed += 1;
      fail(`protected-read${path}`, `expected 401/403, got ${res.status}`);
    }
  }

  // 3) OTP responses should stay generic and never expose a dev code.
  {
    const emailsToTest = OTP_KNOWN_EMAIL ? [OTP_KNOWN_EMAIL, OTP_UNKNOWN_EMAIL] : [OTP_UNKNOWN_EMAIL, `missing-alt-${Date.now()}@example.invalid`];
    const responses = [];
    for (const email of emailsToTest) {
      const result = await request("/api/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      responses.push(result);
    }

    const all200 = responses.every(({ res }) => res.status === 200);
    const allGeneric = responses.every(({ json }) => hasGenericOtpResponse(json));
    const leakedDevCode = responses.some(({ json, text }) => json?.devCode || /devcode/i.test(text));
    const sameBody = responses.every(({ text }) => text === responses[0].text);

    if (all200 && allGeneric && !leakedDevCode && sameBody) ok("otp-generic-response");
    else {
      failed += 1;
      fail(
        "otp-generic-response",
        `statuses=${responses.map(({ res }) => res.status).join(",")} generic=${allGeneric} sameBody=${sameBody} leakedDevCode=${leakedDevCode}`
      );
    }
  }

  // 4) CORS blocked origin should return 403 (when CORS_ORIGINS configured).
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
    // 5) Unknown field payload should be rejected.
    {
      const { res } = await request("/api/profile/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ unknownField: "x" })
      });
      if (res.status === 400) ok("unknown-field-rejected");
      else {
        failed += 1;
        fail("unknown-field-rejected", `expected 400, got ${res.status}`);
      }
    }

    // 6) Oversize image upload should be rejected.
    {
      const oversized = `data:image/png;base64,${"A".repeat(3 * 1024 * 1024)}`;
      const { res } = await request("/api/profile/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify({ photoData: oversized })
      });
      if (res.status === 400) ok("oversize-image-rejected");
      else {
        failed += 1;
        fail("oversize-image-rejected", `expected 400, got ${res.status}`);
      }
    }

    // 7) Cells endpoint should not accept a bare shared access code anymore.
    {
      const { res } = await request("/api/cells", {
        headers: { "x-access-code": "definitely-invalid" }
      });
      if (res.status === 401 || res.status === 403) ok("access-code-read-blocked");
      else {
        failed += 1;
        fail("access-code-read-blocked", `expected 401/403, got ${res.status}`);
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

