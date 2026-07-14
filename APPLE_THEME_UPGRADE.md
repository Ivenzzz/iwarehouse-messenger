# Appearance upgrade — Apple theme flavor

Profile → Appearance now offers two skins, per device:
- iWarehouse (default) — the charcoal + orange identity
- Apple — full iOS system palette: systemBlue accent, iMessage-blue chat
  bubbles with the large 18px corner radius, iOS grays/greens/reds, true-black
  dark mode (great on OLED iPhones), and SF typography on Apple devices
  (system font stack; falls back gracefully elsewhere)

Both skins work with Light / Dark / System, apply before first paint (no
flash), and change ZERO functionality or layout — colors, corners, and type
only. Every future feature inherits both skins automatically because the
whole app reads design tokens.

## Update
Frontend-only. Standard cumulative server update; hard-reload devices after.

## Try it
Profile → Appearance → Apple, then open a chat: your bubbles turn iMessage
blue with round corners. Switch dark mode for the OLED true-black look.
Tap iWarehouse to come home.
