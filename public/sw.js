// StackWorks Service Worker
// Strategies:
//   • /assets/* and /vendor/* — content-hashed, CacheFirst (serve from SW
//     cache forever; browser never re-downloads unless the hash changes)
//   • /pieces/*, /icons/*     — CacheFirst (images, infrequently updated)
//   • HTML navigations        — NetworkFirst with cached fallback so a
//     previously visited page can be restored while offline
//   • Everything else         — pass-through; no interception
//
// HTML uses NetworkFirst rather than CacheFirst so normal online visits still
// pick up the newest deployment immediately. The cached fallback is only used
// when the network is unavailable (for example, Safari/iOS discards a tab and
// later needs to reconstruct the page while the device is offline).

// Derive the base path from the SW's own URL so this file works regardless of
// the Vite `base` setting (e.g. "/" for Cloudflare Pages or "/StackWorks/" for
// GitHub Pages).
const BASE = self.location.pathname.replace(/\/sw\.js$/, "/");

const HTML_CACHE = "sw-html-v1";
const ASSET_CACHE = "sw-assets-v5";
const IMAGE_CACHE = "sw-images-v3";

// Bump these cache names to force all clients to drop stale caches after a
// breaking change to the SW caching strategy.
const ALL_CACHES = new Set([HTML_CACHE, ASSET_CACHE, IMAGE_CACHE]);

// Vendor scripts (Stockfish JS/WASM) are loaded as dedicated Workers from a
// cross-origin-isolated page (COEP: require-corp). Chrome requires that:
//   1. The worker response has Cross-Origin-Resource-Policy (for the page to load it)
//   2. The worker response has Cross-Origin-Embedder-Policy (for the worker itself to
//      be considered cross-origin isolated, which Stockfish needs for SharedArrayBuffer)
//
// We inject both headers on every hashed-asset response served from the SW cache so
// that stale cached entries (from before _headers was properly deployed) don't cause
// COEP violations that silently kill the Stockfish worker.
function withCorp(response) {
  // Only touch successful responses; pass errors through unchanged.
  if (!response || !response.ok) return response;
  const needsCorp = !response.headers.get("cross-origin-resource-policy");
  const needsCoep = !response.headers.get("cross-origin-embedder-policy");
  if (!needsCorp && !needsCoep) return response;
  const headers = new Headers(response.headers);
  if (needsCorp) headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (needsCoep) headers.set("Cross-Origin-Embedder-Policy", "require-corp");
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

function isHtmlNavigation(request) {
  return request.mode === "navigate" || request.destination === "document";
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

  // ── HTML pages: NetworkFirst with offline fallback ───────────────────────
  if (isHtmlNavigation(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.status < 400) {
            const copy = res.clone();
            event.waitUntil(caches.open(HTML_CACHE).then((cache) => cache.put(req, copy)));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(HTML_CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          throw new Error("offline-navigation-miss");
        }),
    );
    return;
  }

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
