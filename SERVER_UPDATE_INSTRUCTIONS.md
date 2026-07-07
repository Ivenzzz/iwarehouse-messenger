# iWarehouse Messenger — Production Server Update Instructions

For: IT Department · Update package: iwarehouse-messenger-production-update-2026-07.zip · Estimated time: 30–45 minutes · Expected downtime: ~5–10 minutes during rebuild

## What this update contains

- Tasks module: convert chat messages into assigned, deadline-tracked tasks with a verification workflow; server-enforced rule that flagged tasks cannot be verified by their own assignee
- Incidents module: structured incident reports (13 types incl. stock variance, missing unit, cash discrepancy) with P1/P2/P3 priority, SKU/IMEI/ERP references, owners, escalation contacts, and SLA deadline countdowns; the owner can never verify or close their own resolution
- Push notifications (Web Push/PWA): notifications reach phones and desktops even when the browser is closed; app becomes installable
- GPS-stamped camera: activates automatically on HTTPS — live viewfinder, photos burned with date/time, GPS coordinates, employee and branch; coordinates also stored server-side
- Alert sounds, notification improvements, security hardening (login error handling, unique refresh-token IDs, avatar response headers), and two audited bug fixes
- Three database migrations (tasks, incidents, push_subscriptions) — apply AUTOMATICALLY on API start; no manual database work

## Assumptions

- Ubuntu VPS already running the platform via Docker Compose with HTTPS
  (docker-compose.yml + docker-compose.prod.yml), project at ~/msg
- If the project lives elsewhere, substitute the path throughout
- The server .env file is NEVER deleted or overwritten by this procedure

## Step 0 — Prerequisites

- SSH access to the server
- This zip file on the technician's PC
- 30 minutes where a short chat outage is acceptable (do it off-peak)

## Step 1 — Upload the package (on the PC)

    scp iwarehouse-messenger-production-update-2026-07.zip USER@SERVER-IP:~

## Step 2 — Connect

    ssh USER@SERVER-IP

## Step 3 — Backup first (mandatory)

    cd ~/msg && bash scripts/backup-postgres.sh

Confirm a new file exists in ~/msg/backups. If the script is missing:

    docker compose exec postgres pg_dump -U iwm iwarehouse_messenger > ~/backup-before-update.sql

Do not proceed without a successful backup.

## Step 4 — Replace the application code

    cd ~/msg
    rm -rf apps
    unzip -o ~/iwarehouse-messenger-production-update-2026-07.zip -d ~/msg

Note: the zip contains no .env; existing secrets and configuration survive.

## Step 5 — Rebuild in production mode

    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --force-recreate

Takes 5–10 minutes. Database migrations apply automatically when the api
container starts. Both -f flags are required (the second carries the HTTPS
configuration).

## Step 6 — Enable push notifications (one-time)

Generate the server's push signing keys:

    docker compose exec api npx web-push generate-vapid-keys

Append to ~/msg/.env (nano .env):

    VAPID_PUBLIC_KEY=<printed public key>
    VAPID_PRIVATE_KEY=<printed private key>
    VAPID_SUBJECT=mailto:it@iwarehouse.ph

Save, then restart the api to load them:

    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate api

## Step 7 — Verify

    docker compose ps
    curl -s https://chat.iwarehouse.ph/api/health/ready
    docker compose exec api npx prisma migrate status

Expect: all containers Up/healthy · {"status":"ready"...} · "Database schema
is up to date". Then in a browser at https://chat.iwarehouse.ph (hard
refresh): sign-in works; a group chat header shows "Create Task" and "Raise
Incident"; Profile shows a "Push notifications" toggle; on a phone, the
composer camera opens a live viewfinder with a GPS status chip.

## Step 8 — Post-update smoke test (optional but recommended)

From the repo on any machine with PowerShell:

    powershell -ExecutionPolicy Bypass -File scripts\smoke-test.ps1 -BaseUrl https://chat.iwarehouse.ph -Password "<admin password>"

All checks should pass.

## Rollback (if verification fails)

1. Re-extract the previous release zip over ~/msg (same Steps 4–5), OR
2. Database only: docker compose exec -T postgres psql -U iwm iwarehouse_messenger < ~/backup-before-update.sql
The new migrations are additive (new tables only); rolling back the code
while keeping the new empty tables is safe.

## Troubleshooting quick hits

- 502 after rebuild → wait 2 min, then: docker compose restart nginx
- api unhealthy → docker compose logs api --tail 50 (send output to the developer channel)
- Build error naming a TypeScript file → incomplete extract: repeat Step 4
- Push toggle absent → VAPID keys missing/typo in .env, or api not recreated after editing (Step 6 restart)
- Full reference: IT_HANDBOOK.md §7 (in this package)
