/* public/sw.js  -  Chapterhive's service worker.
   Keeps the app shell (styles, scripts, icons, an offline page) so the installed app opens quickly
   and shows a friendly page with no signal. Pages and API answers always come fresh from the server
   (never cached), so nobody sees someone else's data or an old version of a page. */
const VERSION = "ch-v1";
const SHELL = [
  "/offline.html",
  "/css/styles.css",
  "/css/chapterhive.css",
  "/images/chapterhive-mark.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) { return cache.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return; // always live

  // Pages: network first; with no connection, the offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(function () { return caches.match("/offline.html"); }));
    return;
  }

  // Styles, scripts, images and fonts: use the network and keep a copy; fall back to the copy offline.
  if (/\.(css|js|svg|png|jpg|jpeg|webp|gif|woff2?)$/i.test(url.pathname)) {
    event.respondWith(fetch(req).then(function (res) {
      if (res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(VERSION).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true });
    }));
  }
});
