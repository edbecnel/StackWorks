// StackWorks Service Worker
// Strategies:
//   • /assets/* and /vendor/* — content-hashed, CacheFirst (serve from SW
//     cache forever; browser never re-downloads unless the hash changes)
//   • /pieces/*, /icons/*     — CacheFirst (images, infrequently updated)
//   • Everything else         — pass-through; no interception
//
// HTML pages are intentionally NOT cached by the SW. Serving stale HTML would
// reference old content-hash filenames after a deploy and silently break pages.
// The `Cache-Control: no-cache, must-revalidate` header in _headers is the
// correct mechanism for HTML — it causes a fast conditional revalidation
// (304 Not Modified) without a full re-download when nothing changed.

// Derive the base path from the SW's own URL so this file works regardless of
// the Vite `base` setting (e.g. "/" for Cloudflare Pages or "/StackWorks/" for
// GitHub Pages).
const BASE = self.location.pathname.replace(/\/sw\.js$/, "/");

const ASSET_CACHE = "sw-assets-v1";
const IMAGE_CACHE = "sw-images-v1";

// Bump these cache names to force all clients to drop stale caches after a
// breaking change to the SW caching strategy.
const ALL_CACHES = new Set([ASSET_CACHE, IMAGE_CACHE]);

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

// ── Install: skip waiting so the new SW takes over without a second page load.
self.addEventListener("install", () => {
  self.skipWaiting();
});

// ── Activate: delete caches from older SW versions, then claim all clients.
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

// ── Fetch: intercept same-origin GET requests only.
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

  // All other requests (HTML navigation, API calls, etc.): let the browser
  // handle normally — no SW interception.
});
