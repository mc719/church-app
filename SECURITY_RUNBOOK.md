# Security Runbook

This runbook covers day-to-day security operations for the church app.

## 1) Environment and Secrets

- Keep secrets only in Render environment variables.
- Never store secrets in git or static files.
- Required secrets:
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `ACCESS_CODE` (if external access-code flow is used)
  - `CORS_ORIGINS`

### Secret Rotation Procedure

1. Generate new secret values.
2. Update Render env vars.
3. Redeploy service.
4. Verify `/api/health` and login flow.
5. Invalidate sessions (see Section 3).

---

## 2) CORS Management

`CORS_ORIGINS` must be a comma-separated list of exact origins:

Example:

`https://church-app-u3l1.onrender.com,https://yourdomain.com`

Rules:
- Include protocol (`https://`).
- Include port when applicable.
- No paths or trailing route segments.

If users report CORS issues:
1. Check browser request `Origin` header.
2. Add exact origin to `CORS_ORIGINS`.
3. Redeploy and retest.

---

## 3) Session Invalidation / Forced Logout

Token versioning is enabled.

Use this endpoint to invalidate active tokens for current user:

- `POST /api/auth/logout-all`

When to use:
- suspected account compromise
- after password reset
- after privilege changes

Expected behavior:
- old JWTs become invalid
- users must sign in again

---

## 4) Security Logging and Alerts

The server logs:
- API write audit events (`[AUDIT]`)
- lockout events (`[SECURITY] Login lockout triggered`)
- status spike warnings (`[SECURITY] API status spike`)

Monitor for:
- repeated 401/403 bursts
- repeated lockouts from same IP/user
- unusual spikes in write endpoints

---

## 5) Incident Response (Basic)

### A) Suspected credential leak
1. Rotate `JWT_SECRET` and affected credentials.
2. Redeploy.
3. Force logout sessions.
4. Review audit logs for suspicious writes.

### B) Brute-force/login abuse
1. Confirm rate-limit and lockout are active.
2. Check source IPs in logs.
3. Tighten rate limits if needed.

### C) Unexpected data changes
1. Identify actor and endpoint from `[AUDIT]` logs.
2. Revert data from DB backups if needed.
3. Temporarily restrict affected route permissions.

---

## 6) Security Smoke Test

Run:

`npm run security:test`

Environment vars for test runner:
- `BASE_URL`
- `TEST_USERNAME`
- `TEST_PASSWORD`
- `CORS_ORIGINS`

The smoke suite validates:
- unauthorized writes blocked
- blocked CORS origin returns 403 JSON
- unknown fields rejected
- oversized image payload rejected

---

## 7) Backup and Recovery Checklist

- Ensure Postgres automated backups are enabled.
- Test restore procedure regularly.
- Record last successful restore test date.

---

## 8) Change Control

Before production deploy:
1. Run app build.
2. Run security smoke test.
3. Review `server.js` route auth middleware on modified endpoints.
4. Confirm no secret or `.env` changes are staged.

