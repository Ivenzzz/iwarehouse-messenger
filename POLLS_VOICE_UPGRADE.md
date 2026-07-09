# Polls & Voice upgrade

## 📊 Polls (new)
- Composer + menu → "Create poll": question, 2–10 options, optional
  multiple-choice
- The poll lands in chat as a LIVE card: tap an option to vote, tap again to
  unvote; result bars, counts, and voter names update in real time for
  everyone (like Messenger polls, with names visible — it's an internal tool)
- Votes are stored properly server-side (membership-checked; simultaneous
  votes can't corrupt each other)
- Ops uses: "Which branch can absorb 5 units?", "Meeting at 3 or 4?",
  "Who's covering Saturday?"

## 🎤 Voice recording — Messenger-style controls
While recording you now see all three controls at once, matching the
Facebook flow you screenshotted:
  ✕ cancel · ■ stop-and-review · Send ➤ (sends IMMEDIATELY, no preview step)
The review path still exists for careful messages; the fast path is one tap.

## Update
One new migration (polls) — applies automatically. Standard cumulative
server update (steps 1–5, 7).

## Test
1. + → Create poll → "Lunch?" with 3 options → card appears → vote from two
   accounts → bars, counts, and names update live on both screens.
2. Mic → speak → tap "Send ➤" while still recording → voice note sends
   instantly.
