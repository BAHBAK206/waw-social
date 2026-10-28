/* Loaded into the service worker: shows push notifications and opens the right page when one is tapped. */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Qubedu', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Qubedu';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/favicon-48.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { link: typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
