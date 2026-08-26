const STATIC_CACHE = "balcao-static-v2";
const STATIC_ASSETS = [
  "/logo-balcao.webp",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  const isStaticAsset =
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:avif|webp|png|jpe?g|gif|svg|ico|woff2?|css|js)$/i.test(url.pathname);
  if (!isStaticAsset) return;

  const revalidate = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  });
  event.waitUntil(revalidate.then(() => undefined).catch(() => undefined));
  event.respondWith(
    caches.match(request).then((cached) => cached || revalidate).catch(() => Response.error()),
  );
});
