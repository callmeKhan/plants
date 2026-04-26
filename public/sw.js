// Bump this version on every deploy to force SW update
const CACHE_VERSION = "v3";
const CACHE_NAME = `plant-manager-${CACHE_VERSION}`;

// On install: skip waiting so the new SW takes over immediately
self.addEventListener("install", () => {
  self.skipWaiting();
});

// On activate: delete all old caches, then claim clients right away
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Skip non-http (e.g. chrome-extension://)
  if (!url.protocol.startsWith("http")) return;

  // Skip API calls — always go to network
  if (url.pathname.startsWith("/api/")) return;

  // _next/static assets are content-hashed by Next.js → cache-first is safe
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else (HTML navigation, images, etc.) → network-first
  // This guarantees users always get the latest deploy.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache a fresh copy for offline use
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline fallback: serve from cache if available
        return caches.match(event.request).then(
          (cached) => cached || caches.match("/")
        );
      })
  );
});
