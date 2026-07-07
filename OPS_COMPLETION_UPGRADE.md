# Ops Completion upgrade — Announcements, Members, ERP Cards

The last "soon" buttons are gone. This release finishes the original
operations specification.

## What's new

📣 Targeted announcements (managers and above)
- New megaphone button in the Chats header
- Pick the audience: Everyone / selected branches / selected departments
- Write once → the system posts into a durable announcement channel per
  audience, automatically adds every matching ACTIVE employee (new hires
  get picked up on the next post), and notifies them (bell + chime + push)
- "Mark as read" / "Seen by N" tracking works on every post, so you know
  exactly who has seen the policy
- Members can't reply in announcement channels (read-only), keeping them
  clean

👥 Group member management (group owner, group admin, or company admin)
- Context drawer → Members tab: "+ Add people" with a checklist of everyone
  not yet in the group
- ✕ next to a member removes them; anyone (except the owner) can ✕
  themselves to LEAVE a group
- The owner can never be removed; direct chats stay fixed; announcement
  channel membership is handled by targeting
- Additions/removals take effect live for everyone

🔗 ERP reference cards
- Composer + menu → "Attach ERP record" is live: pick the type (Stock
  Transfer, GRN, Invoice, RMA, PO, SO, Other), paste the reference number,
  optional note
- Renders as a structured card in chat; tap the number to copy it
- Groundwork for deep ERP integration later (cards will become clickable
  links into the ERP once we get API access to it)

## Setup
No new .env values. No database migrations. Standard update:
- Windows dev: delete C:\msg\apps (KEEP .env) → extract →
  docker compose up -d --build --force-recreate → Ctrl+F5
- Production: SERVER_UPDATE_INSTRUCTIONS.md steps 1–5 and 7

## Test it
1. Announcements: as Michael → 📣 → Branches → pick two → write a policy →
   Post. Both branch channels receive it; sign in as a member of one →
   notification + the post with "Mark as read". Check "Seen by N" grows.
2. Members: open a group → drawer → Members → + Add people → add someone →
   they see the group instantly. ✕ them → gone. Try to ✕ the owner: no
   button, and the server refuses anyway.
3. ERP: + menu → Attach ERP record → TRANSFER / TR-2026-00844 → card lands
   in chat → tap the number → it's on your clipboard.
