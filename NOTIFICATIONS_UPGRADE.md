# Notifications upgrade — Messenger-strength alerts for every message

## What changed
- EVERY chat message now fires a real OS notification (banner + the
  system's notification sound + vibration on Android) through push —
  exactly how Facebook Messenger alerts. Works from any tab, any app,
  or with the browser fully CLOSED
- Smart quiet rule: no banner only when you are actively focused on that
  exact conversation. Reading a different chat, another tab, another app,
  or away → full-strength alert
- One banner per conversation (they update instead of stacking), but the
  sound re-plays for each new message
- Muted conversations send nothing; your own messages never alert you
- In-app chimes are 2–3× louder and phones vibrate with them

## REQUIRED once per device: turn push ON
Profile → "Push notifications" → toggle ON → Allow. Without this the
browser will not deliver OS notifications — this is the switch that makes
it "work like Facebook".

## If sound is still weak/silent after that — it's a DEVICE setting
- Windows: Settings → System → Notifications → Chrome must be allowed with
  sound; Focus Assist / Do Not Disturb OFF
- Android: phone media/notification volume up; Chrome notifications allowed
- iPhone: install the app to Home Screen first (Share → Add to Home
  Screen), then enable push inside it — iOS rule
The notification sound itself is the operating system's sound (same as
Messenger uses); the OS controls its volume.

## Update
Standard cumulative server update (steps 1–5, 7). Includes the composer
redesign and all prior fixes.

## The test that proves it
1. Phone: Profile → Push ON → Allow. CLOSE the browser completely.
2. From the PC, send a plain message to that person.
3. Phone buzzes + plays the system notification sound + shows the banner.
   Tap it → lands in the conversation. That's the Facebook behavior.
