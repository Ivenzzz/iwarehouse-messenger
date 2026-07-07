# Phase 6 upgrade — PWA + Push notifications

Until now, notifications only worked while the app was open in a tab. This
update makes iWarehouse Messenger installable like an app and able to
notify people even when the browser is CLOSED — assignments, incidents,
and mentions reach phones and desktops directly.

## What's new
- Service worker + Web Push: real system notifications (title, body, app
  icon); tapping one opens the right conversation
- Every existing notification now also goes to push: @mentions, task
  assigned / submitted / verified / blocked, incident assigned / resolved /
  verified, escalation-contact alerts. Mute rules still respected
- Profile → "Push notifications" toggle per device (asks browser permission
  on first enable)
- Dead subscriptions are cleaned automatically; push failures never affect
  the app
- PWA: with the service worker in place the app is installable
  (Chrome: address bar install icon / menu → "Install app")

## ONE-TIME SETUP — add the push keys to C:\msg\.env
Push is off until the server has its signing keys. Open C:\msg\.env in
Notepad and add these three lines at the bottom, then rebuild as usual:

VAPID_PUBLIC_KEY=BO-ACgZ7XU-aC_6nW_Smo3r3Aps6Z3V6R79y6MDUHd6gKS3TWe7jpygqSeFtc1Gvcj9mnvK21w4TbnY30aSYHwA
VAPID_PRIVATE_KEY=v_8VI7RDwhb1WuahBkrihwsQr72tmyF9Z2-snfETWfk
VAPID_SUBJECT=mailto:it@iwarehouse.ph

(At production deployment, generate a FRESH pair on the server with
`docker compose exec api npx web-push generate-vapid-keys` — runbook §5
rule: every dev secret gets replaced.)

## Upgrade (Windows)
1. Add the three .env lines above
2. Close editors → delete C:\msg\apps (KEEP .env) → extract this zip
3. docker compose up -d --build --force-recreate
4. Wait + Ctrl+F5

## Where it works
- Your PC at http://localhost — WORKS TODAY (browsers treat localhost as
  secure): full push, even with the tab closed while the browser runs
- Phones over the LAN (http://192.168…) — browser-blocked until HTTPS, same
  rule as the camera; the toggle simply doesn't appear
- After deployment at https://chat.iwarehouse.ph — works everywhere;
  iPhones need the app installed to Home Screen first (iOS 16.4+ rule)

## Test it (on the PC)
1. Profile → enable "Push notifications" → Allow
2. Sign in as Jean in ANOTHER browser (not another tab of the same one)
3. Close the Michael tab completely (keep the browser running)
4. As Jean, assign Michael a task → a system notification pops → click it →
   the app opens on the conversation

Notes: one new migration (push_subscriptions) applies automatically.
Offline message drafts were considered and deferred — low value until the
production rollout.
