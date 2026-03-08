// StackWorks Service Worker
// Strategies:
//   • /assets/* and /vendor/* — content-hashed, CacheFirst (serve from cache,
//     never expire, cache on first fetch)
//   • /pieces/*, /icons/* — CacheFirst with long TTL (versioned in filename)
//   • *.html / navigation   — StaleWhileRevalidate (serve cached immediately,
//     update cache in background so next visit gets the newest version)
//   • Everything else       — pass-through (no interception)

// Derive the base path from the SW's own URL so this file works regardless of
// the Vite `base` setting (e.g. "/" for Cloudflare Pages or "/StackWorks/" for
// GitHub Pages).
const BASE = self.location.pathname.replace(/\/sw\.js$/, "/");

const ASSET_CACHE = "sw-assets-v1";
const PAGE_CACHE = "sw-pages-v1";
const IMAGE_CACHE = "sw-images-v1";

// Bump these names (not the numbers above) whenever you want users to drop
// stale caches from a previous incompatible SW version.
const ALL_CACHES = new Set([ASSET_CACHE, PAGE_CACHE, IMAGE_CACHE]);

// Content-hashed, immutable assets — safe to cache forever.
function isHashedAsset(url) {
  const p = url.pathname;
  return p.startsWith(BASE + "assets/") || p.startsWith(BASE + "vendor/");
}

// Piece / icon images — infrequently updated, cache-first is fine.
function isImage(url) {
  const p = url.pathname;
  return p.startsWith(BASE + "pieces/") || p.startsWith(BASE + "icons/");
}

// HTML navigation requests.
function isNavigation(request) {
  return (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html") ||
    request.url.endsWith(".html") ||
    request.url.endsWith(BASE) ||
    new URL(request.url).pathname === BASE.replace(/\/$/, "") + "/"
  );
}

// — Install: claim immediately so the SW takes over existing tabs on first install.
self.addEventListener("install", () => {
  self.skipWaiting();
});

// — Activate: remove caches from older SW versions, then claim all clients.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !ALL_CACHES.has(n)).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

// — Fetch: intercept same-origin GET requests only.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // ── Hashed assets: CacheFirst ──────────────────────────────────────────────
  if (isHashedAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res.ok && res.status < 400) cache.put(req, res.clone());
            return res;
          });
        }),
      ),
    );
    return;
  }

  // ── Images: CacheFirst ─────────────────────────────────────────────────────
  if (isImage(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) =>
        cache.match(req).then((hit) => {
          if (hit) return hit;
          return fetch(req).then((res) => {
            if (res.ok && res.status < 400) cache.put(req, res.clone());
            return res;
          });
        }),
      ),
    );
    return;
  }

  // ── HTML / navigation: StaleWhileRevalidate ────────────────────────────────
  if (isNavigation(req)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        const cached = await cache.match(req);

        // Always update the cache in the background (fire-and-forget).
        const networkFetch = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);

        // Serve cached response immediately if available; otherwise wait for network.
        if (cached) {
          // Don't await — runs in background.  eslint-disable-next-line @typescript-eslint/no-floating-promises
          networkFetch;
          return cached;
        }
        return (await networkFetch) ?? new Response("Offline", { status: 503, statusText: "Offline" });
      })(),
    );
    return;
  }

  // All other requests: let the browser handle normally (no interception).
});
