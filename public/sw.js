// App-shell service worker for the installable "Salon Manager" home-screen app.
//
// Deliberately network-first, not cache-first. This file only re-runs its
// install/activate steps when ITS OWN bytes change — a plain content or code
// edit elsewhere is invisible to it. Vite's build also renames the JS bundle
// on every deploy (content-hashed filenames), so a fixed pre-cached file list
// would go stale immediately. Network-first sidesteps both problems: every
// request tries the live network first (so a reopen always gets the current
// deploy), and only falls back to the last-seen cached response when there's
// genuinely no connection.
const CACHE_NAME = "salon-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
