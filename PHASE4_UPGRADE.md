# Phase 4 upgrade — Operational features

What this adds:
- Replies: hover a message, tap the reply arrow; the original is quoted above
  your answer.
- Reactions: hover a message, tap the smiley, pick one of the quick emoji
  (thumbs up, check, X, heart, laugh, wow). Tap a reaction chip to toggle
  yours; hover a chip to see who reacted.
- @Mentions: type @ in the composer to get member suggestions. Mentioned
  people get a notification even if they're in another chat. Mentions render
  highlighted in orange.
- Pinned messages: group owners/admins (anyone in a DM) can pin from the
  hover toolbar. A pinned bar appears at the top of the chat; tap it for the
  full list.
- Saved messages: bookmark any message from the hover toolbar; the new Saved
  tab in the left rail collects them privately, with jump-to-chat.
- Announcement acknowledgements: in announcement channels every post gets a
  "Mark as read" button and a live "Seen by N" counter; tap it to see exactly
  who has acknowledged and when.
- Search: the magnifier in the Chats header searches every message and file
  you have access to, with match highlighting; click a result to open the
  conversation.
- Mute: bell button in the chat header silences that conversation's
  notifications (mentions included); a muted icon shows in the sidebar.
- Notifications bell: live unread badge in the Chats header; the dropdown
  lists your mentions, opening one jumps to the conversation.

## How to upgrade (Windows)

1. Extract this zip INTO C:\msg, replacing files. Your .env stays untouched.
2. PowerShell in C:\msg:

       docker compose up -d --build --force-recreate

3. Wait for green checkmarks plus ~1 minute of warm-up, then Ctrl+F5 in the
   browser.

No database migration needed — every Phase 4 table has existed since Phase 1.

## Quick test

Two browser windows (normal + Incognito), Michael and Jean, same group:
- Jean types "@michael.yap please check the STO" — Michael's bell badge
  lights up instantly.
- Michael hovers Jean's message, reacts with a checkmark — Jean sees it
  appear live.
- Michael (group admin) pins the message — the pinned bar appears for both.
- In Company Announcements, Michael posts; Jean clicks "Mark as read";
  Michael taps "Seen by 1" to see Jean's name and timestamp.
- Search "STO" from the magnifier and jump back to the message's chat.
