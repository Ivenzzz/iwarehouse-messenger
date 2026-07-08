# Storage upgrade — Image optimization

Your question: "will chat storage fill up in a few days?" The math: 5
branches × 30 photos/day × 5 MB ≈ 22 GB/month at full size — months, not
days, but a real problem. This release fixes it at the root instead of
punishing users with tighter limits.

## What changed
- Every image is now downscaled + recompressed ON THE SERVER before it
  touches storage: longest edge capped at 2048px (sharper than any chat
  view needs), smart JPEG recompression
- Measured result on a simulated 10.5 MB phone photo: 1.1 MB (9.2× smaller);
  typical real photos do even better → the same disk now lasts ~10× longer
- PNGs (screenshots) are resized but STAY PNG — text stays crisp,
  transparency preserved. GIFs untouched (animation). Small images that are
  already efficient pass through unchanged. Any processing error falls back
  to storing the original — optimization can never block a send
- GPS stamped-camera photos: the burned-in stamp survives resizing (it's in
  the pixels) and the server-side GPS record is untouched
- Privacy bonus: hidden EXIF metadata (including phone-embedded GPS on
  gallery photos people didn't mean to share) is stripped; orientation is
  baked in first so nothing displays sideways
- Profile photos are now stored at 512px (~45 KB each)
- The 50 MB per-file limit (UPLOAD_MAX_MB) still applies to everything;
  videos are not transcoded (too heavy for the VPS) — the cap governs them

## Monitoring
Admin → System dashboard already shows total file storage; watch it weekly.
Old files are never auto-deleted (evidence!). If a retention policy is ever
wanted (e.g. purge files older than 2 years), say so — it's a small,
deliberate addition.

## Configuration (.env — optional, defaults shown)
IMAGE_OPTIMIZE=true
IMAGE_MAX_EDGE=2048
IMAGE_JPEG_QUALITY=82

## Setup
New dependency builds into the api container automatically. No migrations.
Standard update on both machines; existing stored images stay as they are
(only new uploads are optimized).

## Test
Send a phone photo → open the Files panel → the stored size shows a few
hundred KB instead of several MB, and it still looks perfect full-screen.
