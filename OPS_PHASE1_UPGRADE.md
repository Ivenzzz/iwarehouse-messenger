# Ops Phase 1 upgrade — Chat usability for operations

The messenger now begins its evolution into the iWarehouse operations
communication system. Chat stays for discussion; the foundations for Tasks
(accountability) and Incidents (urgent problems) are now in place.

## What changed

Chat list (left panel)
- Filter chips: All / Unread / Mentions / Assigned to Me / Incidents /
  Announcements
- Rows now show: icon, branch tag, department tag, type badge, P1/P2/P3
  priority badge, @ mention indicator, unread badge, muted and pinned icons
- Pinned conversations sort to the top (pin from the chat header 📌)

Conversation header
- Pin/unpin conversation button
- Priority selector (P1/P2/P3) for group owners and admins — the badge
  appears in everyone's sidebar instantly

Messages
- Consecutive messages from the same sender within 5 minutes are grouped:
  name/timestamp shown once per group
- Copy button in the hover toolbar
- LONG-PRESS a message on phones/tablets to open the action toolbar
  (hover doesn't exist on touch — this closes that gap)

Composer
- The + button now opens a menu: Upload file, Take photo (opens the camera
  on phones — built for delivery proof, stock variance evidence, damaged
  units), and clearly-marked "soon" entries for Create task, Raise incident,
  Request approval, Attach ERP record, Share location

New navigation rail
- Inbox (renamed from Chats), Tasks, Incidents, Saved, Directory, Admin
- Tasks page: "Assigned to me" with a proper empty state (backend in Ops
  Phase 2)
- Incidents page: open-incidents view with empty state (backend in Ops
  Phase 3)

Typed foundations (for the next phases)
- lib/ops-types.ts: Task, TaskStatus + workflow, Incident, IncidentType,
  Announcement, ERPLink, OpsRole — matching the spec exactly
- lib/ops-service.ts: service layer the pages call; mock today, one-file
  swap to live APIs later

## Database migration

One new migration (20260704000000_ops_phase1) adds conversations.priority
and conversation_members.pinnedAt. It is applied AUTOMATICALLY when the api
container starts — no manual step, existing data untouched.

## How to upgrade (Windows)

1. Extract this zip INTO C:\msg, replacing files (.env stays untouched).
2. PowerShell in C:\msg:

       docker compose up -d --build --force-recreate

3. Wait for checkmarks + 1 minute, then Ctrl+F5.

## Quick test

- Open Urgent Stock and Delivery Issues as Michael → set priority P1 in the
  header → see the red P1 badge appear in Jean's sidebar.
- Pin the conversation → it jumps to the top of the list.
- Filter by Mentions after Jean @mentions Michael.
- On your phone: long-press a message → toolbar appears; + → Take photo →
  camera opens.
