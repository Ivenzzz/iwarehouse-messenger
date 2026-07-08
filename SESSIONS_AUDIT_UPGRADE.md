# Sessions & Audit upgrade — No auto-logout + Admin message log

## Sessions: signed in until YOU sign out
- Sessions now slide: while a device is used at all, it stays signed in
  indefinitely. Sign-out happens only when the user taps Sign out, an admin
  deactivates them, or a device sits completely untouched for a YEAR
- On the SERVER, edit ~/msg/.env: set JWT_REFRESH_TTL=31536000 (or delete
  the line to use the new default), then restart the api:
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate api
- "Keep me signed in" unchecked at login still ends the session when the
  browser closes — that remains the shared-PC option, by design
- Security note: long sessions make the existing protections do the work —
  instant admin deactivation, stolen-token detection, and per-device
  sign-out all remain active

## Admin message log (Admin page → Message log)
- Full compliance record of ALL messages: search text, "deleted only" filter
- Deleted messages: shown with content intact, who deleted, and when —
  user deletion hides messages from chats but NOTHING leaves this log
- Edited messages: every previous version is now preserved — expand
  "edited ×N" to read the original text with timestamps (before this
  release, edits overwrote the original; from now on history is kept)
- Audit data is visible ONLY here: regular members never receive edit
  history or deletion records in the app

## Current deletion rights (unchanged, now documented)
- Users: edit/delete their OWN messages
- Group owners/admins + company admins: may delete anyone's message in
  their conversations (moderation)
- Everything remains in the admin log regardless of who deleted

## Update
Standard cumulative server update + the one .env line above. No migrations.

## Test
1. Send a message as Jean, edit it, then delete it → Admin → Message log →
   find it red-flagged "deleted by Jean" with full text, expand "edited ×1"
   → original text visible.
2. Confirm a normal user's chat shows only "message deleted" — no content.
