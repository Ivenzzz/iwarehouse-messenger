# Phase 3 upgrade — Uploads and media

What this adds: attach photos, videos, voice/audio files, PDFs, Word, Excel,
PowerPoint, CSV, TXT and ZIP to any message. Images preview inline, videos
play in the chat (with seeking), audio gets a player, other files show a
download card. ZIP downloads show a safety warning. Each conversation gets a
Files button showing everything shared (Photos and videos / Documents tabs).
Uploads show a live progress bar and can be canceled; the 50 MB default limit
is configurable with UPLOAD_MAX_MB in .env. Files are stored in MinIO, never
in the database, and every download is permission-checked against
conversation membership.

## How to upgrade (Windows)

1. Extract this zip INTO your project folder (C:\msg), replacing files.
   Your .env is not in the zip and stays untouched.
2. PowerShell in C:\msg:

       docker compose up -d --build --force-recreate

   (force-recreate also restarts nginx so you don't hit the 502 again)
3. Hard-refresh the browser: Ctrl+F5.

No database migration needed.

## Quick test

Open a conversation, click the + next to the message box (or drag a photo
straight into the chat), pick an image, wait for the progress bar, press
Send. The photo should appear inline for both you and the other signed-in
user instantly. Then click Files in the chat header to see it in the shared
media grid.
