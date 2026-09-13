/* eslint-disable no-restricted-globals */
// Minimal, hand-written service worker (no build-time injection).
// Strategy:
//  - Never cache API calls (/api/*) — always go to the network.
//  - App shell (HTML) — network-first, falling back to cache when offline.
//  - Static assets (JS/CSS/images/fonts) — cache-first, refreshed in the background.

const CACHE_NAME = "pastry-quin-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests; let everything else (POST/PUT/DELETE) pass through.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept API calls — always hit the network so data stays fresh.
  if (url.pathname.startsWith("/api/")) return;

  // Cross-origin requests (fonts, analytics, etc.) — just let the browser handle them.
  if (url.origin !== self.location.origin) return;

  // Navigations (SPA routes): network-first, fall back to cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html")),
    );
    return;
  }

  // Static assets: cache-first, refresh cache in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    }),
  );
});
