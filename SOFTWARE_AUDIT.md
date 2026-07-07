# iWarehouse Messenger — Software Audit Report

Version audited: build "tested" (July 2026) · Auditor: development AI, code-level review · Method: direct inspection of source, configuration, schema, and 24-test auth suite results; findings verified against the actual code, not documentation.

Severity scale: CRITICAL (fix before production) · HIGH (fix before production) · MEDIUM (fix soon after go-live) · LOW (plan) · INFO (note).

## 1. Security audit

### 1.1 Verified strong (evidence checked)

- Passwords hashed with Argon2id; refresh tokens stored only as SHA-256 hashes; rotation with reuse detection revokes compromised sessions (proven by tests, incl. the same-second jti fix)
- Cookies: httpOnly + SameSite=Lax on access, refresh, and OAuth-state cookies; refresh cookie path-scoped to /api/auth; secure flag driven by COOKIE_SECURE
- Global guard stack: Throttler → JWT auth → Roles on EVERY route by default; public routes are explicit opt-outs (@Public: login, refresh, google, health). No route relies on remembering to add a guard
- Role checks are ranked (SUPER_ADMIN ≥ ADMIN ≥ …), so @Roles('ADMIN') correctly admits SUPER_ADMIN
- Input validation: global ValidationPipe with whitelist + forbidNonWhitelisted (unknown body fields rejected)
- Helmet security headers on the API; nginx prod config adds HSTS/nosniff/frame options
- Uploads: extension+MIME allowlist, size caps, SHA-256 recorded, stored with attachment disposition, downloads authorized against conversation membership; avatars limited to image types, 8 MB
- No raw SQL beyond a literal health-check SELECT 1 (no injection surface; Prisma parameterizes everything). Frontend has exactly one dangerouslySetInnerHTML — a static, constant theme-init script (no user data)
- Postgres/Redis/MinIO bound to 127.0.0.1 only; web/api reachable only through nginx
- Append-only audit logging for auth successes/failures/lockouts/reuse-detection/admin actions (verified by tests)

### 1.2 Findings

S-1 · HIGH · No malware scanning of uploads. Any member can distribute a malicious PDF/DOCX/ZIP internally; scanStatus is recorded as SKIPPED by design. Mitigations in place: strict type allowlist, no execution-prone types (svg/html/exe blocked), attachment disposition, ZIP warning. Remediation: ClamAV sidecar scanning on upload before message attach (planned Phase 5 work). Until then this is an accepted internal-trust risk — document it to IT.

S-2 · HIGH (production gate) · Development credentials are burned. Every secret used so far has passed through support conversations. Remediation is procedural and already scripted in GODADDY_DEPLOYMENT.md §5: fresh values for ALL secrets at deployment; rotate/deactivate demo users.

S-3 · MEDIUM · WebSocket CORS reflects any origin (origin: true + credentials). Practical exposure is limited because auth rides on SameSite=Lax cookies (not attached to cross-site WS handshakes) and every event handler re-checks membership. Remediation: restrict gateway CORS to APP_URL at deployment. Deliberately left permissive in dev so LAN-IP phone testing works.

S-4 · MEDIUM · No session/data retention jobs. sessions (expired/revoked rows), notifications, and audit_events grow forever. Not a security hole, but stale-session rows accumulate and audit review gets heavy. Remediation: nightly cleanup job (delete expired sessions >30 days, notifications >90 days; archive audit_events yearly).

S-5 · MEDIUM · Login throttling is per-IP+route, lockout per-account (5/15min — verified). Behind nginx, the API sees the proxy IP unless X-Forwarded-For is trusted; ThrottlerGuard uses connection IP. Remediation: configure express 'trust proxy' + throttler to honor X-Forwarded-For at deployment, otherwise all users share one IP bucket (over-throttling, and per-IP limits lose meaning).

S-6 · LOW · CSP not customized. Helmet defaults + Next inline scripts mean CSP is effectively permissive for self. Remediation: tailored CSP post-deployment (report-only first).

S-7 · LOW · Avatar serving lacked nosniff/disposition headers. FIXED in this build (inline + nosniff added). Files endpoint already had them.

S-8 · INFO · /api/docs (Swagger) is publicly reachable (endpoints listed; all require auth to call). Fine internally; consider disabling in production or gating behind ADMIN.

S-9 · INFO · users/:id and directory expose name/email/branch/role to any authenticated employee — intended for an internal directory; confirm HR is comfortable.

## 2. Database audit

### 2.1 Verified strong
- Versioned migrations, auto-applied; schema matches code (migrate status clean)
- UUID keys everywhere; soft deletes on users/messages; FK actions deliberate (cascade member/message children; SET NULL for authors so history survives user deletion)
- Correct unique constraints (email, username, storageKey; composite PKs on join tables)
- Hot-path index present: messages(conversationId, createdAt DESC, id) matches the pagination query exactly; sessions(userId, expiresAt), notifications(userId, readAt), audit(createdAt/action/actor) all indexed
- Refresh tokens hashed at rest; files stored in MinIO with only metadata in Postgres (DB stays small)

### 2.2 Findings

D-1 · MEDIUM · Unread counts are N+1. listForUser runs one COUNT per conversation per refresh; with ~30 conversations × frequent sidebar invalidations this is fine at pilot scale (≤50 users) but will show at hundreds. Remediation: single grouped count query (one groupBy) — straightforward rewrite when needed.

D-2 · MEDIUM · Message/file search uses ILIKE contains — sequential scans as volume grows. Remediation: enable pg_trgm + GIN index on messages.content (one migration) or Postgres full-text tsvector; abstracted behind searchMessages so it's a drop-in.

D-3 · LOW · Orphaned uploads. Files uploaded but never attached to a sent message stay status=COMPLETE in MinIO forever (user canceled the send). Remediation: nightly job deleting COMPLETE-but-unattached uploads older than 24h (pairs with S-4's job).

D-4 · LOW · Deleted users block email reuse (unique email + soft delete). Acceptable policy; if rehires occur, admin flow should rename the old email (e.g. suffix .deleted).

D-5 · INFO · read_receipts serves double duty (announcement acknowledgements) while per-member lastReadAt drives chat read state — intentional, but document it so future devs don't "unify" them incorrectly.

## 3. Flow audit (request/event flows walked end-to-end)

### 3.1 Verified correct
- Auth: login → cookie pair → guarded requests → silent refresh with single retry → rotation → reuse detection → forced re-login with cookie cleanup and no redirect loops (24 automated tests, all passing; two real defects found and fixed during testing)
- Messaging: optimistic send with temp-id replacement and socket-dedupe (no double messages when the echo beats the HTTP response); membership re-checked server-side for join/typing/send/read; conversation.updated fan-out updates sidebars; sender's own read pointer advances on send
- Uploads: validate → hash → MinIO → attach on send; attachments verified as sender-owned + unconsumed; contentType inferred; deleted messages hide attachments and reactions
- Mentions: parsed server-side against real member usernames (not display names); notifications respect per-conversation mute; sounds respect mute/own/open-conversation rules
- Session-death UX: middleware no longer traps users; every path lands on /login?expired=1 with a human explanation

### 3.2 Findings

F-1 · MEDIUM · Socket auth is checked at connect only. A session revoked mid-connection keeps its live socket until disconnect (REST calls die immediately). Exposure: read-only event receipt for that conversation set until reconnect. Remediation: on auth.session revocation, emit a server-side disconnect for that user's sockets (small gateway addition), or periodic revalidation.

F-2 · LOW · Mention regex can over-match inside pasted email addresses (e.g. "@iwarehouse" from a pasted address) — notifies only if a member has that exact username, so practical impact ≈ 0. Remediation: require word-boundary + no preceding alphanumeric.

F-3 · LOW · Read receipts in DMs update lastReadAt but the UI shows no per-message "seen" tick yet (data exists; UI deferred). Note as roadmap, not defect.

F-4 · INFO · conversation.updated fires for icon/title edits without kind:'message' — correctly produces no chime; documented so future events keep the tag discipline.

## 4. UI audit

### 4.1 Verified strong
- Production build compiles clean, 12 routes; zero TypeScript errors; the two client bugs found in this audit cycle are covered by regression tests
- Consistent design system (tokens, line icons, stamps, 820px reading column); dark/light/system with no flash-of-wrong-theme; responsive with real mobile affordances (long-press actions, bottom nav, one-tap camera)
- Empty states everywhere data can be absent; disabled future features clearly marked "soon" — no dead buttons pretending to work; errors surface server messages verbatim since the login-fix

### 4.2 Findings

U-1 · MEDIUM · Admin photo upload (Directory EDIT overlay) is hover-only — unreachable on touch devices. Remediation: make the avatar always tappable for admins on touch (or show a small edit badge persistently).

U-2 · MEDIUM · Notifications bell renders only on the Chats page; mention chimes are global but there's no visual indicator on Tasks/Saved/Directory. Remediation: move the bell into the rail/top-level layout.

U-3 · LOW · Profile page initializes form fields via setState-during-render (guarded, runs once — sanctioned React pattern but fragile if edited). Remediation: switch to useEffect-on-load.

U-4 · LOW · Accessibility: aria-labels present on icon buttons (verified), but modals lack focus-trapping and Escape handling is inconsistent (lightbox has it; pickers/dialogs partially). Remediation: shared modal primitive with focus trap.

U-5 · LOW · No unread indicator in the browser tab title (users miss messages when tabbed away with sound off). Quick win: "(3) iWarehouse Messenger".

U-6 · INFO · Some legacy alert()/confirm() dialogs remain (reaction errors, ZIP warning) — functional, but inconsistent with the design system; replace with toasts eventually.

## 5. Infrastructure audit

- Compose: healthchecks on stateful services; API waits for DB; migrations auto-apply; prod override adds TLS with correct headers, ACME renewal path, and HTTP→HTTPS redirect — verified consistent with certbot flow in the runbook
- Dev-only exposure: Postgres/Redis/MinIO on loopback; nothing extra listens on LAN
- I-1 · MEDIUM · No log rotation configured for Docker json logs; long-running hosts will grow. Remediation: logging: max-size/max-file in compose (3 lines)
- I-2 · LOW · Backups cover Postgres only by script; MinIO volume needs inclusion in host-level backup (documented in handbook; repeat here for emphasis)

## 6. Prioritized remediation plan

Before production go-live: S-2 rotate all secrets (procedural, scripted) · S-5 trust-proxy + throttler behind nginx · S-3 pin WS CORS to APP_URL · I-1 log rotation.
First month in production: S-1 ClamAV scanning · S-4 + D-3 retention/cleanup jobs · F-1 socket revocation kick · U-1 touch-accessible admin photo edit · U-2 global bell.
As scale demands: D-1 grouped unread counts · D-2 trigram search index.
Quality backlog: U-3/U-4/U-5/U-6, F-2, S-6, S-8.

## 7. Overall assessment

The codebase is in good shape for an internal pilot: authentication and authorization are structurally sound (global-guard architecture, tested branch-by-branch), the data model is disciplined with correct indexes on hot paths, flows handle failure honestly (optimistic UI with retry, forced re-login without traps), and the UI degrades gracefully with no fake functionality. Nothing found rates CRITICAL. The two HIGH items are a known-and-accepted gap (no AV scanning yet — internal trust assumption) and a procedural gate (secret rotation at deployment) that is already scripted. The MEDIUM list is small, specific, and mostly deployment-day configuration. Recommended posture: proceed to pilot; execute the "before go-live" list on deployment day; schedule the "first month" list immediately after.
