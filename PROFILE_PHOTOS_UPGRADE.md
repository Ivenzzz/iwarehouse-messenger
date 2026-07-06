# Profile photos upgrade

Each user can now upload their own profile photo. It appears next to their
messages in group chats, as their conversation avatar in direct messages, in
the staff directory, and in the navigation rail.

## What's included
- New Profile page (rail avatar → Profile, or the Profile tab on mobile):
  upload/change photo (JPG/PNG/WEBP up to 8 MB), edit display name and title.
- Photos show everywhere: group message avatars, DM list icons, directory
  cards, the left rail, and the profile page.
- Graceful fallback to initials when a user hasn't set a photo (so nothing
  looks broken for existing users).
- Photos stored in MinIO (never in the database); served through an
  authenticated endpoint, cached briefly by the browser.

## Works on your current laptop setup
Unlike the live camera, profile photo UPLOAD works fine over http://localhost
and your LAN — it's a normal file upload, no HTTPS required. Users just pick
an existing image file.

## Database migration
None. The avatar field already existed on user profiles from Phase 1; this
update simply uses it.

## How to upgrade (Windows)
1. Extract into C:\msg, replacing files (.env untouched).
2. PowerShell in C:\msg:

       docker compose up -d --build --force-recreate

3. Wait for checkmarks + ~1 minute, then Ctrl+F5.

## Quick test
Sign in, click your avatar at the bottom of the left rail → Profile → Upload
photo → pick an image. It should appear immediately in the rail; open a group
chat and your following messages show the photo, and the directory shows it
on your card. Have Jean do the same and you'll see each other's photos in
shared groups.
