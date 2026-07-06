# UI polish pass — operations workspace refinement

All ten requested fixes, built on the existing components and tokens. No
features removed; chat, uploads, images, filters, DMs, groups all preserved.

## Fixes

1. Filter bar — now a reusable FilterTabs component: scrollbar hidden,
   right-edge fade when more tabs exist, "More" overflow menu on compact/
   mobile widths, Pinned filter added. "All" keeps the soft-orange active
   state.
2. Conversation list density — new ConversationRow: ~18% less vertical
   padding, one-line preview with ellipsis, timestamp far right, unread +
   mention + pinned + muted badges, branch/dept/type/priority tags shown
   only on operational chats (plain DMs stay clean).
3. Emoji icons replaced — new line-icon system (ConversationIcon): DM
   initials, department building glyph, incident alert glyph tinted by
   priority, announcement megaphone, project glyph, branch abbreviation
   (BCD/CDZ/KBL/DGT/SLY…). Custom emoji a group owner set is still honored.
4. Chat header — compact single row: title + priority badge, subtitle line
   (branch · dept · type · members), and icon action buttons (Files, pin,
   mute, details toggle) plus Create Task / Raise Incident buttons on
   operational chats (disabled, clearly "coming"). No more empty header space.
5. Message stream — consecutive messages grouped (name/time once per group),
   outgoing bubbles softened from near-black to charcoal, tighter group
   spacing, date separators. Hover toolbar now a compact pill attached to the
   bubble corner (was detached), with line icons: Reply, React, Pin, Save,
   Copy, Delete.
6. Attachments/images — refined AttachmentCard (type badge, filename with
   safe truncation, size, download icon) and image thumbnails that are no
   longer full-width; click opens a Lightbox with filename, Download, and
   Esc/------click-to-close.
7. Composer — unchanged behavior, still auto-expanding, with the + menu
   (Upload file, Take photo, and clearly-marked upcoming Create task / Raise
   incident / Request approval / Attach ERP record) and emoji menu.
8. Navigation rail — tooltips, active-state indicator bar, and a new
   expandable mode (chevron at the bottom) that reveals text labels for
   Inbox, Tasks, Incidents, Saved, Directory, Admin.
9. Reading column — messages and composer now constrained to a max width of
   ~820px and centered, so bubbles no longer stretch across large monitors.
   The freed space holds the collapsible right context drawer.
10. Context drawer — new ContextDrawer with Details / Tasks / ERP / Files /
    Members tabs. Opens on demand via the header toggle, and auto-opens for
    incident and project conversations. Hidden below the lg breakpoint.

## Components added
FilterTabs, ConversationRow (+ PriorityBadge), ConversationIcon (line-icon
system, replaces the emoji one for identity), ContextDrawer, Lightbox (in
attachment-list), plus header/message icon glyph sets.

## Components changed
chats/page.tsx (uses FilterTabs + ConversationRow), chat-view.tsx (header,
reading column, drawer, grouping), message-row.tsx (attached toolbar,
charcoal bubble, line icons), attachment-list.tsx (lightbox + card),
app/(app)/layout.tsx (expandable rail).

## Needs backend later
Create Task / Raise Incident / ERP / drawer Tasks + ERP tabs surface real
data once the Tasks (Ops Phase 2) and Incidents (Ops Phase 3) backends exist.
They are visible but clearly disabled/empty — no fake data.

## Still future work
Task/incident creation flows and cards, ERP record cards, announcement
compose UI, per-message Create Task action.

## Upgrade
Extract into C:\msg (replace files), then:
    docker compose up -d --build --force-recreate
Ctrl+F5. No database migration.
