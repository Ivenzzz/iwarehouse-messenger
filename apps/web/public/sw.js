/* iWarehouse Messenger service worker — Phase 6 + message push.
 * Push display with Messenger-style behavior:
 * - every push shows a real OS notification (system sound + vibration)
 * - EXCEPT when a window is focused on that exact conversation (the person
 *   is reading it live; the in-app experience covers it)
 * - one notification per conversation (tag), re-sounding on each new message
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'iWarehouse Messenger',
    body: '',
    url: '/chats',
    tag: 'message',
    kind: 'message',
    conversationId: null,
  };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    /* keep defaults */
  }

  event.waitUntil(
    (async () => {
      // Suppress the banner only when the person is actively looking at this
      // conversation right now.
      if (payload.kind === 'message' && payload.conversationId) {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const reading = clients.some(
          (c) =>
            c.focused &&
            c.visibilityState === 'visible' &&
            c.url.includes(`c=${payload.conversationId}`),
        );
        if (reading) return;
      }
      await self.registration.showNotification(payload.title, {
        body: payload.body || undefined,
        tag: payload.tag,
        renotify: true, // re-play the system sound for every new message
        vibrate: [180, 80, 180],
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: payload.url },
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/chats';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
