// sw.js — offline service worker for the OKC rehab games.
// Strategy: cache-first, then network; every successfully-fetched GET (app files,
// MediaPipe wasm, and the pose model from the CDN) is cached on first online use,
// so the app runs fully offline afterwards.
const CACHE = "okc-offline-v1";

self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;                     // offline-first
    try {
      const res = await fetch(req);
      // cache app files, CDN wasm/js (cors) and the model (opaque) alike
      if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
      return res;
    } catch (err) {
      const fallback = await cache.match(req);
      if (fallback) return fallback;
      throw err;
    }
  })());
});
