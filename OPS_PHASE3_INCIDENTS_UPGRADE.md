# Ops Phase 3 upgrade — Incidents

"Guys we have a problem" messages get scrolled away. Incidents don't: they
have an owner, a deadline, a status, and someone independent must confirm
the fix before they close.

## What's new

Raise an incident three ways
- "Raise Incident" button in every group chat header (red, now live)
- Composer + menu → Raise incident (now live)
- Incidents page → Raise incident button

Structured report fields
- 13 incident types: Stock Variance, Missing Unit, Wrong IMEI/Serial,
  Delivery Delay, Delivery Damage, Cash Discrepancy, Financing Document
  Missing, Customer Complaint, RMA Delay, Damaged Unit, System Outage,
  Security Concern, Other
- Priority P1 (critical) / P2 (high) / P3 (normal)
- Description, SKU, IMEI/serial, ERP reference (transfer/GRN/invoice/RMA)
- Assigned owner, escalation contact, resolution deadline

The workflow (enforced server-side)
Open → Acknowledged → Assigned → In Progress → Resolved → Verified → Closed
- Owner acknowledges, works, and marks Resolved
- THE CRITICAL RULE: the owner can NEVER verify or close their own
  resolution — the reporter, escalation contact, or a manager must confirm.
  The server refuses self-verification outright.

SLA countdowns everywhere
- Live "3h 20m left" countdowns; under 4 hours turns amber; past deadline
  turns red "SLA breached"
- The Incidents page pins an "SLA breached" section on top

Live incident cards in chat
- Raising an incident drops a card in the conversation: P1/P2/P3, type,
  status, SKU, owner, deadline. Updates for everyone as the incident moves.
  Tap to open the full drawer.

Incident drawer
- Full report, SLA banner, contextual action buttons (only moves YOU may
  make), complete timestamped activity log.

Incidents page (rail → Incidents)
- Members see incidents involving them; MANAGERS/ADMINS see the whole
  incident board. Show-closed toggle, live updates.

Notifications + urgent chime when: an incident is assigned to you, you're
named escalation contact, a resolution needs your verification, or your
incident is verified/closed.

Evidence photos: post photos in the incident's conversation (camera button)
— once deployed on HTTPS they carry the GPS/date stamp automatically.

## Database migration
One new migration (incidents + incident_activity) applies AUTOMATICALLY on
api start. Existing data untouched.

## Upgrade (Windows)
1. Close editors → delete C:\msg\apps (KEEP .env) → extract this zip to C:\msg
2. docker compose up -d --build --force-recreate
3. Wait for checkmarks + 1 minute → Ctrl+F5

## The demo that shows it off
As Jean in a stock group: Raise Incident → Stock Variance, P2, "Expected 8
units iPhone 15 128GB, counted 7", SKU IP15-128-BLK, owner Warehouse
Supervisor, escalation Michael, deadline tomorrow 6 PM → Raise. Card lands
in chat with the countdown. As wh.supervisor: chime + bell → Incidents page
→ Acknowledge → Start work → (recount, post a photo in chat) → Mark
resolved. Now try Verify as the supervisor: the button isn't offered — and
the server would refuse it anyway. As Jean (or Michael): Verify resolution →
Close incident. Open the activity log: report → assign → work → resolve →
independent verification → close, all timestamped.
