# Phase 5 upgrade — Production Hardening + Admin

The build that lets the system run unattended: virus scanning, self-cleaning
data, instant session revocation, and a live system dashboard. Closes the
security audit's remaining HIGH item and the "first month" list.

## What's new

Antivirus scanning (closes audit S-1, the last HIGH)
- New clamav container scans every upload in the background (sender never
  waits). Infected files: object deleted immediately, record kept as
  evidence, download and attach both refuse with "blocked by antivirus"
- Policy: scanner offline → uploads allowed but marked FAILED and logged
  (fail-open; an internal tool shouldn't lose file sharing when AV hiccups).
  Rationale + how to flip to fail-closed documented in the code
- NOTE: the clamav container needs ~1 GB RAM and downloads its signature
  database on first start (several minutes, needs internet)

Self-cleaning data (audit S-4 + D-3)
- Nightly 3 AM job: expired/revoked sessions older than 30 days, read
  notifications older than 90 days, and uploads that were never attached to
  a message (canceled sends) — rows AND storage objects removed. Counts
  logged each night.

Instant session kill (audit F-1)
- Revoking a session, detecting token theft, signing out, or deactivating a
  user now DISCONNECTS their live realtime connection immediately — not on
  their next page load. Deactivation is now truly instant.

Admin system dashboard
- Admin page now opens with live stats (auto-refreshes every 60s): active users,
  live sessions, messages, conversations, open tasks, SLA-breached
  incidents (red when nonzero), file storage used, database size, and open
  incidents per branch. Your first management view of the whole system.

Quality fixes (audit U-1 + U-5)
- Admins on PHONES can finally set anyone's photo: persistent pencil badge
  on directory avatars (desktop keeps the hover overlay)
- Browser tab title shows total unread: "(3) iWarehouse Messenger" — visible
  from any other tab

## Setup notes
- .env: add (or confirm) these lines — scanning is ON when present:
    CLAMAV_HOST=clamav
    CLAMAV_PORT=3310
  Leave CLAMAV_HOST empty to disable scanning entirely (uploads marked SKIPPED).
- No new database migrations in this release.
- If the server is tight on RAM, scanning can be deferred: set CLAMAV_HOST=
  (empty) and remove/stop the clamav container; everything else works.

## Upgrade
Windows dev: delete C:\msg\apps (KEEP .env) → extract → add the two .env
lines → docker compose up -d --build --force-recreate (first run pulls
clamav, be patient) → Ctrl+F5.
Production server: follow SERVER_UPDATE_INSTRUCTIONS.md steps 1–5 & 7, plus
the two .env lines before the rebuild.

## Test it
1. AV: upload any file → Files panel: it lands normally (background scan).
   Check verdicts: docker compose logs api | grep -i clamav / infected
   (Optional deep test: create the harmless EICAR test string file — search
   "EICAR test file" — upload it, watch it get blocked.)
2. Session kill: sign in as Jean on a phone, then as admin deactivate Jean →
   the phone drops to the login page within seconds.
3. Dashboard: Admin page → System cards populate; assign an overdue-deadline
   incident and watch "SLA breached" turn red.
4. Tab title: leave the app in a background tab, send it a message from
   another browser → the tab shows "(1) iWarehouse Messenger".
