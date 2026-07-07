# Test report — authentication & session handling
Date: July 6, 2026 · Build: login-fix + jti hardening

## What was tested and how
Two automated suites run the REAL application code (not copies of the logic):
- apps/api/test/auth.logic.test.ts — the actual AuthService with real Argon2id
  hashing and real JWT signing, against an in-memory database stand-in.
  Rerun: cd apps/api && npm run test:auth
- apps/api/test/client.api.test.ts — the actual web client interceptor
  (apps/web/lib/api.ts) with a mocked fetch/window.
  Rerun: cd apps/api && npm run test:client
Plus a live HTTP smoke test for the running Docker stack:
  scripts/smoke-test.ps1 (PowerShell; add -Password "..." for the full pass)

## Results: 24/24 automated tests pass

Server login branches (all pass)
- Unknown email → 401 "Incorrect email or password" (no user enumeration)
- Wrong password → 401 same message; failedLoginCount increments
- 5th failure → lockedUntil set ≈15 minutes ahead
- Locked account → 403 "Account temporarily locked…" even with the CORRECT password
- Deactivated account → 403 "…deactivated. Contact your administrator."
- Correct login → tokens + user payload; counters reset; access JWT carries
  sub/role/sid and verifies with the access secret; refresh token stored as
  SHA-256 hash, never plaintext
Refresh/session branches (all pass)
- Happy-path refresh rotates the stored token hash
- REUSE of a rotated token → 401 "Session revoked", session revoked, audit
  event auth.refresh_reuse_detected recorded
- Revoked/expired session → 401 "Session expired"
- Garbage token → 401 "Invalid refresh token"; missing → 401 "Missing refresh token"
- User deactivated mid-session → refresh rejected "Account disabled"
- Logout revokes only the caller's own session; audit trail records
  FAILURE / DENIED / SUCCESS entries

Client interceptor (all pass)
- REGRESSION for the reported bug: a failed LOGIN now surfaces the server's
  real message ("Incorrect email or password" / lockout text) instead of the
  misleading "Session expired", and never triggers the refresh path
- Data request 401 → one silent refresh → original request retried once
- Refresh failure → stale cookies cleared via /auth/logout → redirect to
  /login?expired=1 (single redirect, no loop when already on /login)
- Non-401 errors (e.g. 429 rate limit) pass through with server messages

## Defects found by testing and FIXED in this build
1. Login-error masking (reported by user): the client relabeled every failed
   sign-in as "Session expired". Fixed — /auth/* responses bypass the
   refresh/redirect interceptor. Covered by a regression test.
2. Refresh tokens minted within the same second were byte-identical (JWT
   second-resolution timestamps), so rotation could silently not rotate and
   reuse-detection was blind inside that window. Fixed — every refresh token
   now carries a unique random jti. Covered by the rotation and reuse tests.

## Not covered by these suites (needs the live stack)
HTTP/cookie flags, nginx routing, WebSocket auth, uploads — covered by
scripts/smoke-test.ps1 on the running system, and by manual checks in
IT_HANDBOOK.md section 7.
