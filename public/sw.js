/**
 * CBT Service Worker — caches ONLY the static app shell.
 * Never caches API responses or anything containing questions/answers.
 *
 * Strategy:
 *  - Static assets under /_next/static/ : cache-first (immutable, hashed names)
 *  - Page shell (HTML)                 : network-first, cache fallback
 *  - Anything under /api/              : network-only (never cached)
 */

const SHELL_CACHE = 'cbt-shell-v1';
const SHELL_URLS = ['/', '/login', '/dashboard', '/admin/login'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API routes.
  if (url.pathname.startsWith('/api/')) {
    return; // browser makes the request normally (network-only)
  }

  // Cache-first for immutable Next.js static assets.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(SHELL_CACHE).then((cache) =>
        cache.match(event.request).then(
          (cached) => cached || fetch(event.request).then((resp) => {
            cache.put(event.request, resp.clone());
            return resp;
          })
        )
      )
    );
    return;
  }

  // Network-first for navigation/page requests, with shell cache fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
});
