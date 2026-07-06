# iWarehouse Messenger — IT Department Handbook

Version: 1.0 (build "sounds", July 2026) · Classification: Internal — IT Operations

This handbook is the complete operations reference for the iWarehouse Messenger platform: what it is, what works today, how to run it, how to fix it, and how to take it to production.

## 1. System overview

iWarehouse Messenger is a self-hosted internal communication platform for iWarehouse Corp covering all branches and departments. It replaces public chat apps (Viber/Messenger groups) with a company-controlled system: all data stays on company servers, every account is company-managed, and every security-relevant action is audited.

The platform is an evolving operations system, not only a chat app. The current build delivers full messaging, file/media sharing, and the operational layer (priorities, filters, announcements with acknowledgement tracking). Task management and incident reporting modules are designed and partially scaffolded (see section 3.4).

Current deployment status: running in development on a Windows PC via Docker Desktop. Production target: GoDaddy Ubuntu 24.04 VPS at https://chat.iwarehouse.ph (full runbook: GODADDY_DEPLOYMENT.md).

## 2. Technology stack and architecture

- Frontend: Next.js 14 (React, TypeScript, Tailwind CSS), served as a Node container
- Backend API: NestJS (Node 20, TypeScript) with Socket.IO for realtime
- Database: PostgreSQL 16 (Prisma ORM, versioned migrations, auto-applied on API start)
- Cache/presence: Redis 7
- File storage: MinIO (S3-compatible object storage) — all uploads and avatars; never stored in the database
- Reverse proxy: NGINX (HTTP dev config, TLS production config included)
- Orchestration: Docker Compose (single command brings up the entire stack)

### 2.1 Containers and ports

| Container | Role | Internal port | Exposed |
|---|---|---|---|
| nginx | Reverse proxy, TLS termination (prod) | 80/443 | 80 (dev), 80+443 (prod) |
| web | Next.js frontend | 3000 | via nginx only |
| api | NestJS API + WebSocket gateway | 4000 | via nginx only |
| postgres | Database | 5432 | 127.0.0.1 only |
| redis | Cache | 6379 | 127.0.0.1 only |
| minio | Object storage | 9000/9001 | 127.0.0.1 only |
| minio-init | One-shot bucket creation | — | — |

All user traffic enters through nginx: `/api/*` → api, `/socket.io/*` → api (WebSocket), everything else → web. Database, Redis, and MinIO are never exposed beyond localhost.

### 2.2 Key directories (project folder, e.g. C:\msg or ~/msg)

- `apps/api` — backend source; `apps/api/prisma` — schema, migrations, seed
- `apps/web` — frontend source
- `docker/nginx` — nginx.conf (dev) and nginx-ssl.conf (production TLS)
- `docker-compose.yml` + `docker-compose.prod.yml` (production override)
- `scripts/` — backup-postgres.sh, restore-postgres.sh
- `docs/` — ARCHITECTURE, DEPLOYMENT, SECURITY, BACKUP_AND_RESTORE
- `.env` — all secrets and configuration (NEVER commit or share; not included in update zips)

## 3. Feature inventory

### 3.1 Working now — verified in the current build

Authentication and accounts
- Email + password sign-in; Argon2id password hashing
- Short-lived access tokens (15 min) with rotating refresh tokens (30 days); refresh-token reuse detection revokes the session (stolen-token protection)
- Account lockout: 5 failed attempts → 15-minute lock (configurable)
- Automatic redirect to the login page with a clear notice whenever a session expires or is revoked (no dead screens)
- Google sign-in ("Continue with Google"): fully implemented; activates when OAuth credentials are set in .env (see GOOGLE_SIGNIN_SETUP.md). Unknown Gmails rejected by default; optional domain-restricted self-registration
- Roles: SUPER_ADMIN, ADMIN, MANAGER, MEMBER, READ_ONLY, enforced on the server for every request

Messaging (realtime over WebSocket)
- Direct messages and group conversations; conversation types: direct, private group, department, branch, announcement, project, incident
- Instant delivery, typing indicators, online/offline presence, per-member read tracking, unread badges, live sidebar updates
- Replies (quoted), reactions (👍 ✅ ❌ ❤️ 😂 😮), @mentions with member autocomplete and instant notification, message edit and delete (soft delete, admins can moderate), copy message
- Message grouping (same sender within 5 minutes), date separators, "load earlier" pagination
- Emoji picker in the composer (work-oriented category included)
- Notification sounds: message chime and distinct mention chime; silent for own messages, the open conversation, and muted conversations; per-device toggle in Profile

Files and media
- Attach up to 10 files per message (drag-and-drop or + menu); per-file progress bars with cancel
- Allowlist: images (jpg/png/webp/gif), video (mp4/mov/webm), audio (mp3/wav/m4a/ogg), pdf, docx, xlsx, pptx, csv, txt, zip; 50 MB default limit (UPLOAD_MAX_MB)
- Inline image previews with full-screen lightbox; in-chat video playback with seeking; audio player; file cards with type badge, size, and download; ZIP download warning
- Per-conversation "Files" panel and context-drawer Files tab (photos/videos grid + documents list)
- SHA-256 recorded per file; downloads permission-checked against conversation membership
- Profile photos: self-upload on the Profile page; ADMINS can upload a photo for any user from the Directory (hover avatar → EDIT). Photos appear beside messages, in DM lists/headers, the directory, and the rail; initials fallback otherwise

Operational layer
- Sidebar filters: All / Unread / Mentions / Assigned to Me / Incidents / Announcements / Pinned (overflow "More" menu on small screens)
- Conversation priority P1/P2/P3 set by group owners/admins; colored badges in sidebar and header
- Pin conversations to the top; pinned messages with a pinned bar per chat
- Branch/department/type tags on conversation rows; line-icon identity system (incident icons tinted by priority; branch code chips)
- Announcement channels: only admins post; every post has "Mark as read" with a live "Seen by N" counter and a full who-and-when list — replaces "did everyone see my message?"
- Saved messages (private bookmarks) with a dedicated tab; global search across all accessible messages and files with match highlighting
- Per-conversation mute (silences chimes and mention notifications); notifications bell with unread badge
- Context drawer (Details / Tasks / ERP / Files / Members), auto-opens for incident/project chats
- Mobile: long-press a message for actions; one-tap camera button; bottom navigation

Administration and audit
- Admin panel: create users, deactivate (kills sessions instantly), reset passwords, revoke sessions
- Append-only audit log: logins, failures, lockouts, Google sign-ins, admin actions
- Staff directory with search and branch/department/role filters

Platform
- Light/dark/system theme; branded UI; PWA manifest (installability completes in Phase 6)
- Database migrations versioned and auto-applied on API start; demo seed (10 branches, 13 departments, 12 users, sample operational conversations)

### 3.2 Built but awaiting configuration (IT action)

- Google sign-in: create a Google OAuth Client ID and set GOOGLE_CLIENT_ID/SECRET in .env → button appears automatically. Steps: GOOGLE_SIGNIN_SETUP.md

### 3.3 Built but dormant until HTTPS (activates automatically on production deployment)

- Live GPS-stamped camera: in-app viewfinder; photos burned with date/time, GPS coordinates ±accuracy, employee name · branch · department; raw GPS+timestamp also stored server-side in the message record (tamper-evident). Browsers only permit live camera + geolocation on secure origins, so on plain HTTP the feature gracefully falls back to gallery upload. No work needed at deployment — it detects HTTPS and switches on.

### 3.4 Visible placeholders (clearly marked, no fake data)

- Tasks page ("Assigned to Me") and Incidents page — typed models and service layer exist; backends are the next build (Ops Phase 2 and 3)
- Composer + menu items marked "soon": Create task, Raise incident, Request approval, Attach ERP record, Share location
- Context drawer Tasks and ERP tabs (empty states)

### 3.5 Not yet built

- Ops Phase 2 Tasks backend (convert message → task, assignment, verify workflow with no-self-verify rule)
- Ops Phase 3 Incidents backend; announcement composer with audience targeting
- Phase 5 admin dashboards (storage usage, system health page)
- Phase 6 PWA install + browser push notifications + offline drafts (requires HTTPS)
- Phase 7 voice/video calls (optional)
- ERP integration (link cards to transfers/POs/invoices)
- Group member management UI (add/remove after creation) and virus scanning worker (uploads currently marked scan-skipped)

## 4. Standard operating procedures

All commands run in PowerShell (Windows) or a shell (Ubuntu) inside the project folder.

### 4.1 Start / stop / status

- Start: `docker compose up -d`
- Stop: `docker compose down` (data persists in Docker volumes)
- Status: `docker compose ps` — healthy/Up is good; "Restarting" or "(unhealthy)" needs logs
- Logs: `docker compose logs api --tail 50` (also: web, nginx, postgres)

### 4.2 Applying an update (the standard procedure)

1. Close any editors holding project files open
2. Delete the `apps` folder inside the project directory (NEVER delete `.env`)
3. Extract the new release zip into the project directory
4. `docker compose up -d --build --force-recreate`
5. Wait for green checkmarks plus ~1 minute warm-up; hard refresh browsers (Ctrl+F5)

Notes: `--force-recreate` prevents the known stale-nginx 502; database migrations apply automatically on API start; the zip never contains `.env`, so secrets survive updates. If a build fails with a TypeScript error naming a file, the extract was incomplete — repeat steps 1–3.

### 4.3 Health checks

- `http://<host>/api/health/live` and `/api/health/ready` — API liveness/readiness
- `docker compose exec api npx prisma migrate status` — must report the schema is up to date
- Swagger API docs: `http://<host>/api/docs`

### 4.4 User management

- Create users: Admin panel (sign in as an ADMIN/SUPER_ADMIN)
- Deactivate: Admin panel — takes effect immediately (sessions revoked)
- Password reset: Admin panel
- Unlock a locked account immediately (otherwise auto-unlocks after 15 min):
  `docker compose exec postgres psql -U iwm iwarehouse_messenger -c "UPDATE users SET \"failedLoginCount\"=0, \"lockedUntil\"=NULL WHERE email='person@iwarehouse.ph';"`
- Force-logout everyone (e.g. after a security event):
  `docker compose exec postgres psql -U iwm iwarehouse_messenger -c "UPDATE sessions SET \"revokedAt\"=NOW();"`

### 4.5 Backup and restore

- Manual backup: `bash scripts/backup-postgres.sh` (from Git Bash/WSL on Windows; native on Ubuntu). Output in `backups/` with integrity check
- Restore: `bash scripts/restore-postgres.sh <file>` — see docs/BACKUP_AND_RESTORE.md
- Production: schedule nightly via cron (runbook section 11). Files/avatars live in the MinIO volume; include it in server-level backups for full coverage
- Quick manual dump: `docker compose exec postgres pg_dump -U iwm iwarehouse_messenger > backup.sql`

## 5. Configuration reference (.env)

| Variable | Purpose |
|---|---|
| APP_URL | Public base URL; must match exactly (http://localhost dev, https://chat.iwarehouse.ph prod). Drives the Google redirect URI |
| COOKIE_SECURE | false on plain HTTP, true in production HTTPS. Wrong value = logins silently fail |
| POSTGRES_* / DATABASE_URL | DB credentials — the password appears in BOTH places and must match |
| REDIS_PASSWORD / REDIS_URL | Same pairing rule as above |
| MINIO_ROOT_USER / MINIO_ROOT_PASSWORD / MINIO_BUCKET | Object storage credentials |
| JWT_ACCESS_SECRET / JWT_REFRESH_SECRET | Two distinct long random strings (openssl rand -base64 48) |
| JWT_ACCESS_TTL / JWT_REFRESH_TTL | Token lifetimes in seconds (900 / 2592000). No inline comments on these lines |
| LOGIN_MAX_ATTEMPTS / LOGIN_LOCKOUT_MINUTES | Lockout policy (5 / 15) |
| UPLOAD_MAX_MB | Per-file upload cap (default 50) |
| SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD | Super-admin created by the seed |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | Enables "Continue with Google" when set |
| GOOGLE_AUTO_CREATE / GOOGLE_ALLOWED_DOMAIN | Self-registration policy — keep AUTO_CREATE=false unless intentionally opening it |

Rule learned the hard way: values must not carry inline `# comments` on the same line — some parsers absorb them into the value.

## 6. Security posture

- Passwords: Argon2id. Sessions: rotating refresh tokens, reuse detection, revocation support
- RBAC enforced server-side per request; conversation membership checked for every message, file, and download
- Uploads: extension + MIME allowlist, size cap, SHA-256 recorded, objects stored with attachment disposition (no browser execution), served only through authenticated permission-checked endpoints
- Audit log is append-only and covers auth + admin events
- Login rate limiting and account lockout; message-send rate limiting (30/min)
- GPS evidence photos: coordinates + timestamp stored server-side, not only burned into the pixels
- Production hardening checklist (deployment day): fresh secrets for EVERY credential used during development (all are considered exposed); COOKIE_SECURE=true; HTTPS via Let's Encrypt with auto-renew; ufw allowing only 22/80/443; nightly backups; rotate the demo users' shared password or deactivate demo accounts before real rollout

Known gaps to close post-deployment: no antivirus scanning of uploads yet (scan status recorded as skipped; ClamAV worker planned); demo seed uses a shared password (iWarehouse!2026) — rotate or deactivate before go-live.

## 7. Troubleshooting playbook (issues actually encountered + fixes)

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser: 502 Bad Gateway | web/api still starting after rebuild, or nginx holding stale container addresses | Wait 1–2 min; if persists: `docker compose restart nginx`. Prevent with `--force-recreate` on updates |
| api "(unhealthy)" in `docker compose ps` | Startup failure or dead-session socket spam | `docker compose logs api --tail 40`; if "session invalid" repeats, users need fresh sign-in (auto-redirect now handles this) |
| Login: "Session expired" loop (historic) | Stale cookies + middleware bounce | Fixed in current build — app clears cookies and lands on /login with a notice |
| Login silently fails / bounces back | COOKIE_SECURE=true on plain HTTP | Set false in .env, `docker compose up -d --force-recreate api` |
| "Account temporarily locked" | 5 failed attempts | Wait 15 min or run the unlock SQL (4.4) |
| Build fails: Type error names a file | Stale/partial extract — old file on disk | Delete `apps`, re-extract, rebuild; `docker compose build --no-cache web` if cache suspected |
| Build fails: COPY … not found / OpenSSL / Cannot find module (historic) | Early Dockerfile issues | Fixed permanently in current Dockerfiles |
| Blank conversation list | API requests failing (session or DB) | Check api logs + `prisma migrate status`; fresh sign-in |
| Seed: "ts-node … exit code 1" (historic) | tsconfig missing in runtime image | Fixed; seed works via `docker compose exec api npm run db:seed` |
| Phone: camera button opens gallery, not camera | Plain HTTP — browsers block live camera/GPS off HTTPS | Expected until production HTTPS; by design it falls back gracefully |
| No chime on new messages | Sound off, muted chat, own message, or no user gesture yet | Profile → Notification sound; check mute; click anywhere once after load |
| Port 80 already in use on Windows | IIS/Skype | Change nginx mapping to "8080:80" in docker-compose.yml |
| Out-of-memory kills (server) | Undersized host (seen on the POS VPS) | Do NOT co-host with the POS; deploy to a box with ≥4 GB free |

## 8. Production deployment

Complete numbered runbook: GODADDY_DEPLOYMENT.md (DNS A-record for chat.iwarehouse.ph → SSH → Docker install → upload → fresh production .env → Let's Encrypt certificate → `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` → seed → firewall → renewal cron → backup cron).

Server guidance from investigation: the POS VPS (148.66.159.172) is memory-constrained and already OOM-killing its own workload — do not deploy there. The ERP VPS (184.168.122.233, 16 GB) can co-host if `free -h` shows ≥4 GB available and credentials are obtained; otherwise a small dedicated VPS (2 CPU / 4 GB / 60 GB) is the clean answer. What HTTPS unlocks on day one: live GPS camera (automatic), production Google sign-in redirect, Phase 6 PWA/push.

## 9. Document index (all ship inside the release zip)

- README.md — quick start
- docs/ARCHITECTURE.md, docs/DEPLOYMENT.md, docs/SECURITY.md, docs/BACKUP_AND_RESTORE.md
- GODADDY_DEPLOYMENT.md — production runbook
- GOOGLE_SIGNIN_SETUP.md — OAuth configuration
- CAMERA_UPLOAD_NOTES.md — camera/HTTPS behavior
- PHASE*/OPS_* upgrade notes — per-release change logs

## 10. Demo credentials (DEVELOPMENT ONLY — rotate before go-live)

- Super admin: michael.yap@iwarehouse.ph / value of SEED_ADMIN_PASSWORD in .env
- Demo users (jean.yap@, wh.supervisor@, bacolod.oic@, …): shared password iWarehouse!2026
- Every password and secret used during development has been discussed in support channels and must be treated as compromised: production gets fresh values for all of them.
