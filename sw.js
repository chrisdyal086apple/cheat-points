/* Cheat Points service worker: keeps the app working offline and installs updates when you tap Restart. */
const VERSION = "2026.10.11.3";
const CORE = "cp-core-" + VERSION;
const FONTS = "cp-fonts-1";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,400;0,500;0,600;0,700;1,700&family=Monoton&family=VT323&display=swap";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon-32.png"];

async function cacheFonts() {
  try {
    const cache = await caches.open(FONTS);
    if (await cache.match(FONT_CSS, { ignoreVary: true })) return;
    const res = await fetch(FONT_CSS, { mode: "cors", credentials: "omit" });
    if (!res.ok) return;
    const css = await res.clone().text();
    await cache.put(FONT_CSS, res);
    const urls = Array.from(css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g), (m) => m[1]);
    await Promise.all(urls.map((u) => fetch(u, { mode: "cors", credentials: "omit" })
      .then((r) => (r.ok ? cache.put(u, r) : null)).catch(() => null)));
  } catch (e) {
    /* Fonts load from the network next time; the app still works. */
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    await cache.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })));
    await cacheFonts();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("cp-core-") && k !== CORE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") {
      event.respondWith((async () => {
        const cache = await caches.open(CORE);
        const hit = await cache.match("./index.html");
        if (hit) return hit;
        try {
          return await fetch(req);
        } catch (e) {
          return new Response("Cheat Points is offline. Open it once with a connection.", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
      })());
      return;
    }
    event.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || fetch(req);
    })());
    return;
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req, { ignoreVary: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return Response.error();
      }
    })());
  }
});
