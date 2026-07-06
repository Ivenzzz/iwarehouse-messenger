# Phase 2 upgrade — Chat Core

What this adds: real message sending, live updates between users (WebSocket),
typing indicators, presence dots, unread badges, read receipts, message
edit/delete, "load earlier" pagination, and a New button to start direct
messages and groups.

## How to upgrade an existing install (Windows)

1. Close nothing — your containers can keep running.
2. Extract the new zip INTO your existing project folder (e.g. C:\msg),
   replacing files when Windows asks. Your `.env` is not in the zip, so your
   passwords and settings are safe.
3. Open PowerShell in the project folder and run:

       docker compose up -d --build

   The api and web containers rebuild (3–6 minutes). Postgres keeps all data.
4. Refresh the browser at http://localhost/ (Ctrl+F5 for a hard refresh).

No database migration is needed — Phase 1 already created every table
Phase 2 uses.

## Quick test

Open two browsers (e.g. Chrome normal + Chrome Incognito). Sign in as
michael.yap@iwarehouse.ph in one and jean.yap@iwarehouse.ph
(password iWarehouse!2026) in the other. Open the same conversation in both
and send a message — it should appear instantly on the other side, with a
typing indicator while composing and an unread badge if the chat is closed.
