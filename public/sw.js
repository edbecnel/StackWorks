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

const ASSET_CACHE = "sw-assets-v4";
const IMAGE_CACHE = "sw-images-v2";

// Bump these cache names to force all clients to drop stale caches after a
// breaking change to the SW caching strategy.
const ALL_CACHES = new Set([ASSET_CACHE, IMAGE_CACHE]);

// Stockfish (and other vendor scripts) are loaded via a blob: bootstrap worker whose
// origin is opaque (null). Under COEP `require-corp`, any cross-origin fetch — including
// blob→same-origin — must carry `Cross-Origin-Resource-Policy`. We inject the header on
// every hashed-asset response so the SW-served copy always satisfies COEP regardless of
// whether Cloudflare forwarded the header at the time the entry was originally cached.
function withCorp(response) {
  // Only touch successful responses; pass errors through unchanged.
  if (!response || !response.ok) return response;
  // If the header is already set (e.g. Cloudflare added it), leave it alone.
  if (response.headers.get("cross-origin-resource-policy")) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
          if (hit) return withCorp(hit);
          return fetch(req).then((res) => {
            const corpRes = withCorp(res.clone());
            if (res.ok && res.status < 400) cache.put(req, corpRes.clone());
            return corpRes;
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
