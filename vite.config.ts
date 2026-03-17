import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs/promises";

const STOCKFISH_FILES = [
  "stockfish-17.1-lite-single-03e3232.js",
  "stockfish-17.1-lite-single-03e3232.wasm",
  "stockfish-17.1-asm-341ff22.js",
];

function normalizeViteBase(raw: string): string {
  let s = (raw || "").trim();
  if (!s) return "/";
  if (!s.startsWith("/")) s = `/${s}`;
  if (!s.endsWith("/")) s = `${s}/`;
  return s;
}

async function copyStockfishToPublic(): Promise<void> {
  const repoRoot = __dirname;
  const srcDir = path.join(repoRoot, "node_modules", "stockfish", "src");
  const outDir = path.join(repoRoot, "public", "vendor", "stockfish");

  await fs.mkdir(outDir, { recursive: true });

  // Copy every time (fast enough; avoids flaky mtime checks across filesystems).
  await Promise.all(
    STOCKFISH_FILES.map((file) => fs.copyFile(path.join(srcDir, file), path.join(outDir, file))),
  );
}

function stockfishPublicCopyPlugin() {
  return {
    name: "lasca-copy-stockfish-to-public",
    async buildStart() {
      try {
        await copyStockfishToPublic();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[vite] failed to copy Stockfish assets to public/vendor/stockfish", e);
      }
    },
  };
}

/**
 * Injects a tiny inline script into every HTML entry point that registers
 * the Service Worker at build time. Only used in production builds so that
 * local development does not accidentally cache stale assets via a SW.
 *
 * The SW file (public/sw.js) is copied to the root of the dist output, so it
 * always lives at `<base>sw.js`. We read the resolved base from Vite's config
 * via the `configResolved` hook rather than hard-coding it.
 */
function injectServiceWorkerPlugin() {
  let resolvedBase = "/";
  return {
    name: "lasca-inject-sw-registration",
    configResolved(config: { base: string }) {
      resolvedBase = config.base || "/";
    },
    transformIndexHtml(html: string) {
      const swUrl = resolvedBase + "sw.js";
      // Minified registration snippet: non-blocking, swallows registration errors
      // so a missing SW file never breaks the page.
      const snippet =
        `<script>if("serviceWorker"in navigator)` +
        `navigator.serviceWorker.register(${JSON.stringify(swUrl)}).catch(function(){});</script>`;
      return html.replace("</head>", `${snippet}\n</head>`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Admin page is intentionally not linked from the UI and not documented publicly.
  // To include it in production builds, set VITE_EMIT_ADMIN=1 at build time.
  // (Useful for self-hosted deployments where operators need online admin tools.)
  // Example: cross-env VITE_EMIT_ADMIN=1 vite build
  // GitHub Pages deployment uses a repo-scoped base like `/<repo>/`.
  // Default to that in production, but allow overriding at build time.
  //
  // - GitHub Pages (repo site): leave unset (defaults to /StackWorks/)
  // - Custom domain at root: set VITE_BASE=/
  // - Subpath hosting: set VITE_BASE=/some/subpath/
  //
  // Only use a non-root base in production; use `/` for local development.
  base:
    mode === "production"
      ? normalizeViteBase(
          typeof process.env.VITE_BASE === "string"
            ? process.env.VITE_BASE
            : process.env.CF_PAGES
              ? "/"
              : "/StackWorks/",
        )
      : "/",
  root: "src",
  // Static assets live at repo-root /public, but Vite's `root` is `src`,
  // so we must point `publicDir` at the correct folder.
  publicDir: "../public",
  server: {
    port: 8080,
    // Cross-origin isolation headers are only effective on trustworthy origins
    // (https or localhost). Opt-in to avoid noisy warnings when using a LAN IP.
    headers:
      process.env.VITE_COI === "1"
        ? {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
          }
        : undefined,
    // When running the multiplayer dev stack (server+client), the client dev server may
    // restart (or be restarted) and Vite would re-open the Start Page each time.
    // Allow disabling auto-open via env so `npm run online:dev` doesn't spam tabs.
    open: process.env.VITE_NO_OPEN === "1" ? false : "/index.html",
  },
  preview: {
    headers:
      process.env.VITE_COI === "1"
        ? {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
          }
        : undefined,
  },
  plugins: [
    stockfishPublicCopyPlugin(),
    // Register the Service Worker in all HTML entry points for production builds.
    // The SW caches hashed assets (forever) and HTML pages (stale-while-revalidate)
    // so that repeat visits load near-instantly from local SW cache.
    ...(mode === "production" ? [injectServiceWorkerPlugin()] : []),
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/index.html"),
        ...(process.env.VITE_EMIT_ADMIN === "1"
          ? {
              admin: path.resolve(__dirname, "src/admin.html"),
              "admin-help": path.resolve(__dirname, "src/admin-help.html"),
            }
          : {}),
        lasca: path.resolve(__dirname, "src/lasca.html"),
        columnsChess: path.resolve(__dirname, "src/columnsChess.html"),
        chess: path.resolve(__dirname, "src/chess.html"),
        lasca8x8: path.resolve(__dirname, "src/lasca8x8.html"),
        dama: path.resolve(__dirname, "src/dama.html"),
        damasca: path.resolve(__dirname, "src/damasca.html"),
        help: path.resolve(__dirname, "src/help.html"),
        columnsChessHelp: path.resolve(__dirname, "src/columnsChess-help.html"),
        chessHelp: path.resolve(__dirname, "src/chess-help.html"),
        damaHelp: path.resolve(__dirname, "src/dama-help.html"),
        checkersHelp: path.resolve(__dirname, "src/checkers-help.html"),
        damascaHelp: path.resolve(__dirname, "src/damasca-help.html"),
        startHelp: path.resolve(__dirname, "src/start-help.html"),
      },
    },
  },
}));
