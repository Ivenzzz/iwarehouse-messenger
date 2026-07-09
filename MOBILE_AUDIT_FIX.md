# Mobile audit & fixes — iPhone (Chrome/Safari)

Reported: wrong resolution, clipped right side, missing composer/nav on
iPhone 16 Pro Max. Audit findings and fixes:

M-1 · iOS FOCUS-ZOOM (the "resolution is wrong" cause). iOS zooms the whole
page whenever a focused input's font is under 16px; ours were 14px. After
tapping the message box, the page stays zoomed → right side (your own
messages, timestamps) pushed off-screen — exactly the screenshots.
FIX: all inputs/textareas/selects render at 16px on touch devices only;
desktop design unchanged. The page no longer zooms when typing.

M-2 · 100vh VIEWPORT LIE. iPhone browsers report a taller viewport than is
actually visible (URL bar), so an app shell sized with h-screen pushes the
composer and bottom nav below the fold.
FIX: shell now uses the dynamic viewport unit (100dvh) with automatic
fallback — the composer and Tasks/Incidents nav always sit exactly at the
visible bottom edge.

M-3 · SAFE AREAS. The home-indicator strip could overlap the composer and
bottom nav.
FIX: viewport-fit=cover + safe-area padding on the composer and mobile nav.

M-4 · HORIZONTAL OVERFLOW GUARD. Any future oversized element could again
drag the page wider than the screen.
FIX: the app shell clamps horizontal overflow; message bubbles were verified
already capped at 78% width.

## Update
Frontend-only fixes, no migrations, no .env changes. Standard cumulative
server update. IMPORTANT on the iPhone after updating: hard-reload the tab
(pull down / reopen) — and if it was "Installed" as an app, close and reopen
it so the new build loads.

## Verify on the iPhone
1. Tap the message box → the page must NOT zoom anymore.
2. The composer and bottom nav hug the bottom edge, never hidden.
3. Your own messages and timestamps fully visible at the right edge.
