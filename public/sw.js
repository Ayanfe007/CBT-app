/**
 * CBT Service Worker — caches ONLY the static app shell.
 * NEVER caches API responses or anything containing questions/answers.
 * Versioned cache name; old workers are replaced on activate.
 */

const SHELL_CACHE = 'cbt-shell-v2';
const SHELL_URLS = ['/', '/login', '/dashboard', '/admin/login'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  // Take control immediately
  void self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NEVER cache API routes — always go to network
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Cache-first for immutable Next.js static assets
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(event.request).then(
          (cached) =>
            cached ||
            fetch(event.request).then((resp) => {
              cache.put(event.request, resp.clone());
              return resp;
            })
        )
      )
    );
    return;
  }

  // Network-first for navigation/page requests, with shell cache fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
});
