const CACHE = "holdem-coach-v4";

self.addEventListener("install", (event) => {
  const base = self.registration.scope;
  const assets = [
    "index.html",
    "styles.css",
    "manifest.webmanifest",
    "icons/icon.svg",
    "js/app.js",
    "js/cards.js",
    "js/hand-evaluator.js",
    "js/lessons.js",
    "js/quiz.js",
    "js/progress.js",
    "js/table.js",
  ].map((path) => new URL(path, base).href);

  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(assets)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
