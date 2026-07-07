# Voice upgrade — Voice notes + Speech-to-text dictation

## 🎤 Voice notes
- New microphone button in the composer: tap → recording bar with live timer
  → Stop → listen to the preview → Send voice note (or Discard)
- Sends through the normal secure pipeline (virus-scanned like every file);
  plays inline in chat with the existing audio player on all devices
- Under 0.7s recordings are ignored (accidental taps)
- Works over HTTPS and on http://localhost (same browser rule as the camera);
  the button hides itself on plain LAN http

## 🗣️ Dictation (voice-to-text)
- New sound-wave button: tap, speak, and your words are typed into the
  message box — review/edit, then send as normal text
- Double-tap the button to switch language: English ↔ Filipino (remembered
  per device). Button turns red while listening; tap again to stop
- Uses the browser's built-in speech recognition: available in Chrome/Edge
  (desktop + Android); the button hides itself where unsupported (Firefox,
  some iPhones)

## Honest notes
- Dictation is "speak-to-type", not transcription of received voice notes.
  Automatic transcripts of voice notes (e.g. Whisper AI on the server) are
  possible later but need real CPU on the VPS — ask when you want it and
  we'll size it.
- Dictation audio is processed by the browser's speech service (Google, for
  Chrome). If that's a concern for sensitive content, type instead.

## Setup
No .env changes, no migrations (webm audio was already allowlisted).
Standard update: dev = delete apps / keep .env / extract / rebuild;
production = SERVER_UPDATE_INSTRUCTIONS.md steps 1–5, 7.

## Test
1. Voice note: mic button → say something → Stop → play the preview → Send →
   it appears in chat as a playable audio message on both sides.
2. Dictation: wave button → speak "please recount cadiz stock today" → words
   appear in the box → Send. Double-tap the wave button and try Filipino.
