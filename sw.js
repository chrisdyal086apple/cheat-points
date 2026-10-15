/* Cheat Points service worker: keeps the app working offline and installs updates when you tap Restart. */
const VERSION = "2026.10.15.4";
const CORE = "cp-core-" + VERSION;
const FONTS = "cp-fonts-1";
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,400;0,500;0,600;0,700;1,700&family=Monoton&family=VT323&display=swap";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon-32.png"];
const MUSIC = "cp-music-1";
const SONGS = ["music/take-off.mp3", "music/golden-dust.mp3", "music/shapes.mp3", "music/space-echo.mp3"];
const pending = new Map();

// Songs: downloaded whole the first time one plays, then served from this phone (in pieces, as players ask).
function download(key) {
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      try {
        const res = await fetch(key, { credentials: "same-origin" });
        if (!res.ok || res.status !== 200) return false;
        await (await caches.open(MUSIC)).put(key, res);
        return true;
      } catch (e) {
        return false;
      } finally {
        pending.delete(key);
      }
    })());
  }
  return pending.get(key);
}
async function songResponse(req) {
  const url = new URL(req.url), key = url.origin + url.pathname;
  const cache = await caches.open(MUSIC);
  let hit = await cache.match(key);
  if (!hit && await download(key)) hit = await cache.match(key);
  if (!hit) {
    try { return await fetch(req); } catch (e) { return Response.error(); }
  }
  const range = req.headers.get("range");
  if (!range) return hit;
  const blob = await hit.blob(), size = blob.size;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m || (m[1] === "" && m[2] === "")) return hit;
  let start, end;
  if (m[1] === "") { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  return new Response(blob.slice(start, end + 1), { status: 206, statusText: "Partial Content", headers: {
    "Content-Type": "audio/mpeg", "Content-Range": "bytes " + start + "-" + end + "/" + size,
    "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" } });
}

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
    // Songs no longer in the app are removed from the phone.
    const keep = new Set(SONGS.map((u) => new URL(u, self.registration.scope).href));
    const music = await caches.open(MUSIC);
    await Promise.all((await music.keys()).filter((r) => !keep.has(r.url)).map((r) => music.delete(r)));
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
  if (url.origin === self.location.origin && /\/music\/[^/]+\.mp3$/.test(url.pathname)) {
    event.respondWith(songResponse(req));
    return;
  }
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
