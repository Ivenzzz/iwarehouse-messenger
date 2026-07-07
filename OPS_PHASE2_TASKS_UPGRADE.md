# Ops Phase 2 upgrade — Tasks

Chat is for discussion. Tasks are for accountability. This update turns
"someone please handle this" messages into tracked, assignable, verifiable
work items.

## What's new

Create a task three ways
- Hover ANY message → new task icon in the toolbar → task modal opens
  prefilled with the message text and linked to it
- "Create Task" button in every chat header (now live, no longer "soon")
- Composer + menu → Create task (now live)

Task fields
- Title, details, assignee (anyone in the company), priority
  (Low/Normal/High/Critical), due date & time, verifier, and the
  "Requires independent verification" flag

The workflow (enforced server-side)
Open → Assigned → In Progress → Blocked → Submitted → Verified → Closed
- Assignee works the task: Start, Mark blocked, Submit for verification
- Verifier (or creator, or a manager) verifies and closes
- THE CRITICAL RULE: when "requires independent verification" is on
  (finance/stock/delivery/RMA/audit/refund work), the assignee CANNOT verify
  or close their own task — the server refuses it, no matter what the UI says

Live task cards in chat
- Creating a task drops a card into the conversation: title, status,
  assignee, due date. The card updates for everyone as the task moves
  through the workflow. Tap it to open the full task drawer.

Task drawer
- Full detail, overdue banner, contextual action buttons (only the moves
  YOU are allowed to make appear), and the complete activity log — who did
  what, when.

Tasks page (rail → Tasks)
- "Assigned to me" and "Created by me" tabs, overdue section on top in red,
  show-closed toggle, live updates.

Everywhere else
- Sidebar rows show an open-task count chip ("2 tasks")
- The "Assigned to Me" filter is now real: conversations containing your
  open tasks
- Context drawer → Tasks tab lists the conversation's tasks
- Notifications + chime when you're assigned, when work is submitted to you,
  when your task is verified/closed, or when a task gets blocked

## Database migration
One new migration (tasks + task_activity tables) applies AUTOMATICALLY when
the api container starts. Existing data untouched.

## Upgrade (Windows)
1. Close editors → delete C:\msg\apps (KEEP .env) → extract this zip to C:\msg
2. docker compose up -d --build --force-recreate
3. Wait for checkmarks + 1 minute → Ctrl+F5

## The demo that shows it off
As Jean, in Urgent Stock and Delivery Issues, send: "Cadiz variance -1 on
iPhone 15 128GB, please recount." As Michael, hover that message → task icon
→ assign to Warehouse Supervisor, priority High, due today 6 PM, tick
"Requires independent verification" → Create. Watch the card land in the
chat. Sign in as wh.supervisor@iwarehouse.ph: bell + chime, Tasks page shows
it under Assigned to me → Start work → Submit for verification. Now try to
Verify as the supervisor — the button isn't even offered, and the server
would refuse it. As Michael: Verify → Close. Open the task's activity log:
the whole chain, timestamped.
