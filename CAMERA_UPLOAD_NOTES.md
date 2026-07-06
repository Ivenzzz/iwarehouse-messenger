# Camera upload — how it works and what it needs

## What's built
- Composer camera button (mobile): one tap opens the phone's rear camera to
  take a photo.
- + menu: "Take photo" and "Record video" open the camera in photo or video
  mode.
- Captured media uploads exactly like any other attachment (progress bar,
  preview inline, stored in MinIO).
- Works on Android (Chrome) and iPhone (Safari).
- 50 MB limit covers phone photos and short videos (raise UPLOAD_MAX_MB in
  .env if you record longer clips).

## The one hard requirement: HTTPS
Phone browsers ONLY grant camera access on secure origins:
- https:// pages  → camera works
- http://localhost on the SAME machine → works (desktop testing)
- http://<LAN-IP> (e.g. http://192.168.1.45) from a PHONE → browser BLOCKS
  the camera. The button will fall back to the photo library instead of the
  live camera, or do nothing.

So over your current plain-HTTP LAN setup, phone camera capture will not open
the live camera. This is a browser security rule, not an app bug — every web
app hits it.

## Two ways to get the live camera on phones
1. Deploy to the server with HTTPS (chat.iwarehouse.ph). Then every phone on
   any network gets full camera capture. This is the real fix and the planned
   next step.
2. For quick LAN testing before deployment: put the app behind HTTPS on the
   local network with a self-signed certificate, or use a tunnel (e.g. a
   Cloudflare/ngrok https URL pointing at your PC). Phones opening the https
   URL get the camera.

## Meanwhile (plain HTTP LAN)
Phone users can still attach a photo they've already taken: tap +, Upload
file, and pick from the gallery. Only the LIVE camera capture needs HTTPS.
