# Security and Operations Runbook

This document is the operational baseline for production security and reliability.

## 1) Production Deploy Checklist

Before every production deploy:

1. Confirm branch protection is enabled on `main`.
2. Confirm CI checks pass:
   - `node --check server.js`
   - `npm --prefix client run build`
3. Confirm env vars exist in Render:
   - `NODE_ENV=production`
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CORS_ORIGINS`
   - `ACCESS_CODE` (if used)
4. Deploy.
5. Run smoke tests:
   - `GET /api/health` returns 200
   - Login works
   - Token refresh works (stay idle, then API call succeeds)
   - Create/update flows work (members/cells/first-timers/reports)
6. Review logs for 5 minutes for startup/runtime errors.

## 2) Rollback Procedure

If deploy is unstable:

1. Render -> Service -> Deploys -> choose previous stable deploy -> Rollback.
2. Verify:
   - `GET /api/health` = 200
   - login + one write API call works
3. Capture incident note:
   - bad deploy commit hash
   - rollback timestamp
   - observed error
4. Open fix PR before next deploy.

## 3) Monitoring and Alerting

Render service alerts to enable:

- deploy failed
- service crash/restart
- health check failed

Recommended cadence:

- Daily: review logs for repeated 401/403/429/5xx spikes.
- Weekly: review `audit_logs` and failed-login trends.

Optional external monitoring (recommended):

- Sentry for backend/frontend exception tracking and alert rules.

## 4) Health and Diagnostics

Health endpoint:

- `GET /api/health`

Audit endpoint (admin only):

- `GET /api/audit-logs?limit=200`

Session control:

- `POST /api/auth/logout` (current session)
- `POST /api/auth/logout-all` (invalidate all sessions for user)

## 5) Secret Rotation Policy (Quarterly)

Rotate in this order:

1. `JWT_SECRET`
2. `ACCESS_CODE`
3. `DATABASE_URL` / DB credentials

Rotation steps:

1. Generate new secret value.
2. Update Render environment variable.
3. Redeploy service.
4. Verify:
   - login
   - refresh token flow
   - core API read/write calls
5. Record date, operator, and outcome in change log.

Notes:

- Rotating `JWT_SECRET` forces re-login (expected).
- After high-risk event, rotate immediately (not waiting for quarter).

## 6) Backup and Restore Drill

Frequency: monthly restore drill.

Procedure:

1. Ensure automated Postgres backups are enabled.
2. Restore latest backup into temporary/staging DB.
3. Run sanity queries:
   - users count
   - members count
   - first_timers count
   - reports count
4. Record:
   - restore start/end time
   - restore success/failure
   - data validation result
5. Remove temporary restore DB if policy allows.

## 7) Incident Response

Severity model:

- `SEV1`: production down, data loss risk, auth bypass suspected
- `SEV2`: major feature broken, elevated error rates
- `SEV3`: isolated bug, no major data/safety risk

Initial response targets:

- SEV1: acknowledge within 15 min
- SEV2: acknowledge within 1 hour
- SEV3: acknowledge within 1 business day

Response workflow:

1. Triage symptoms and scope.
2. Stabilize (rollback/disable risky feature).
3. Preserve evidence:
   - logs
   - timestamps
   - request IDs/paths
4. Fix and redeploy.
5. Post-incident review with preventive actions.

Contacts (fill these in):

- Incident Lead: `<name/email/phone>`
- Backup Lead: `<name/email/phone>`
- DB Owner: `<name/email/phone>`
- Platform Owner (Render): `<name/email/phone>`

## 8) CORS Management

`CORS_ORIGINS` must be exact comma-separated origins.

Example:

`https://church-app-u3l1.onrender.com,https://app.yourdomain.com`

Rules:

- include protocol
- include port if non-default
- do not include paths

If CORS blocked:

1. inspect browser `Origin` header
2. add exact origin to `CORS_ORIGINS`
3. redeploy
4. retest

## 9) Change Control and Evidence

For every production change:

1. link PR + commit hash
2. list migration/schema changes
3. list env var changes
4. attach smoke-test result
5. record rollback plan
