// Cache version is injected via ?v= query param when registering (set in next.config.ts → NEXT_PUBLIC_BUILD_TIME)
const swVersion = new URL(self.location.href).searchParams.get("v") || "v4";
const CACHE_NAME = `plant-manager-${swVersion}`;

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

  // HTML navigations (page requests) — NEVER serve from cache.
  // Always fetch fresh from network so CSS/JS references are always current.
  // Fall back to cached copy only when completely offline.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("/"))
      )
    );
    return;
  }

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

  // Everything else (images, public assets, etc.) → network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => cached || caches.match("/"))
      )
  );
});
