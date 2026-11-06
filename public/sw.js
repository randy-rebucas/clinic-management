const CACHE_NAME = 'mcs-v1';

// App shell assets to pre-cache
const PRECACHE_URLS = ['/'];

// ─── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch (network-first, fallback to cache) ────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only handle GET requests for same-origin navigation
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip API routes, Next.js internals, and cross-origin requests
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful navigation responses
        if (response.ok && event.request.mode === 'navigate') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// ─── Push Notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'MyClinicSoft', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    tag: data.tag || 'mcs-notification',
    renotify: true,
    // An urgent alert stays on screen until someone deals with it.
    requireInteraction: data.priority === 'urgent',
    data: {
      url: data.url || '/dashboard',
      dateOfArrival: Date.now(),
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'MyClinicSoft', options)
  );
});

// ─── Notification Click ──────────────────────────────────────────────────────
// Only ever open this app: the URL comes from the push payload.
function notificationTarget(value) {
  const fallback = new URL('/dashboard', self.location.origin).href;
  try {
    const url = new URL(value || fallback, self.location.origin);
    return url.origin === self.location.origin ? url.href : fallback;
  } catch {
    return fallback;
  }
}

// Bring the app forward on the right page: reuse a window already there, else move an open
// one, else open a new one. A window this worker doesn't control can't be moved.
async function openNotificationTarget(targetUrl) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const appWindows = windows.filter((client) => new URL(client.url).origin === self.location.origin);

  const exact = appWindows.find((client) => client.url === targetUrl);
  if (exact) return exact.focus();

  for (const client of appWindows) {
    try {
      const focused = await client.focus();
      return await focused.navigate(targetUrl);
    } catch {
      // Try the next window.
    }
  }
  return self.clients.openWindow(targetUrl);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(openNotificationTarget(notificationTarget(event.notification.data?.url)));
});
