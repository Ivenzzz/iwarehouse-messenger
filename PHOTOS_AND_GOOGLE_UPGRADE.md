# Chat photos everywhere + Google sign-in enablement

## Photos of the person you're chatting with
- DM conversations already showed the other person's photo in the list and
  header; now their photo ALSO appears beside each of their messages inside
  the chat (like every messenger you know).
- NEW: Admins can upload a photo FOR any user. Directory → hover a person's
  avatar → EDIT → pick an image. Perfect for HR loading everyone's ID photo
  once so every chat shows faces even if staff never set one themselves.
- Fallback initials remain for anyone without a photo.

## Google sign-in
Fully built into the app since Phase 1 — it only needs your Google OAuth
credentials. Full setup steps in GOOGLE_SIGNIN_SETUP.md (5-minute, free).
Once configured, a "Continue with Google" button appears on the login page.
Existing users sign in with their Gmail; strangers are rejected unless you
explicitly enable auto-registration.

## Upgrade (Windows)
1. Close editors; delete C:\msg\apps (keep .env!); extract this zip to C:\msg.
2. PowerShell:  docker compose up -d --build --force-recreate
3. Ctrl+F5.

No database migration.
