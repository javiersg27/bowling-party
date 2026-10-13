// Service Worker de Bowling Party.
// Estrategia: NAVEGACIONES (HTML) siempre van a la red (network-first) para que
// un redeploy se vea al instato; si no hay red, caemos al index.html cacheado.
// Los assets propios (/assets/*.js|.css con hash) usan stale-while-revalidate.
// NO interceptamos orígenes de terceros (Supabase, Google Fonts…).
const CACHE = "bowling-party-v2";
const CORE = ["./", "./manifest.webmanifest", "./favicon.svg", "./icons/icon-192.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deja pasar a terceros tal cual

  // Navegaciones: fresh-first (nunca servir HTML obsoleto tras un deploy).
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./").then((r) => r || caches.match(req))),
    );
    return;
  }

  // Resto de assets propios: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

