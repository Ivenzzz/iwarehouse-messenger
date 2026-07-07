# Accounts upgrade — Remember Me + Admin User Management

## Remember me
- Sign-in now has "Keep me signed in on this device" (checked by default):
  checked → signed in for 30 days on that device; unchecked → signed out the
  moment the browser fully closes (use on shared branch PCs)
- The choice survives silent token refreshes
- Last-used email is prefilled; browser password managers are supported
  (autocomplete hints) — Chrome/Edge will offer to save the password

## Admin user management (Admin page → Users)
There is intentionally NO public registration — every account is created by
an admin. That flow finally has a real interface:
- Users table with search: photo, name, email, role, branch, status
- "+ New user" form: full name, work email, username (for @mentions),
  temporary password (min 10 chars), role, branch, department, job title
- Inline role changes (only a SUPER_ADMIN can grant or change admin roles —
  server-enforced)
- Reset password per user; Deactivate/Activate — deactivation signs the
  person out everywhere INSTANTLY (Phase 5 session kill)

## Setup
No .env changes, no migrations. Standard update procedure (dev: delete
apps/keep .env/extract/rebuild; production: SERVER_UPDATE_INSTRUCTIONS.md
steps 1–5, 7). All 24 auth regression tests re-run and pass with the
remember-me change.

## Test
1. Sign in with the box UNchecked → close the browser completely → reopen:
   login page (correct). Repeat CHECKED → reopen: straight into chats.
2. Admin → Users → + New user → create a test account → sign in with it in
   another browser. Change its role inline. Reset its password. Deactivate
   it while it's signed in elsewhere → watch it drop to the login page.
