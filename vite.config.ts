import { defineConfig } from "vite";
import path from "node:path";
import fs from "node:fs/promises";

const STOCKFISH_WORKER_FILE = "stockfish-17.1-lite-single-03e3232.js";
const STOCKFISH_WASM_FILE = "stockfish-17.1-lite-single-03e3232.wasm";

async function copyStockfishToPublic(): Promise<void> {
  const repoRoot = __dirname;
  const srcDir = path.join(repoRoot, "node_modules", "stockfish", "src");
  const outDir = path.join(repoRoot, "public", "vendor", "stockfish");

  const workerSrc = path.join(srcDir, STOCKFISH_WORKER_FILE);
  const wasmSrc = path.join(srcDir, STOCKFISH_WASM_FILE);
  const workerOut = path.join(outDir, STOCKFISH_WORKER_FILE);
  const wasmOut = path.join(outDir, STOCKFISH_WASM_FILE);

  await fs.mkdir(outDir, { recursive: true });

  // Copy every time (fast enough; avoids flaky mtime checks across filesystems).
  await Promise.all([
    fs.copyFile(workerSrc, workerOut),
    fs.copyFile(wasmSrc, wasmOut),
  ]);
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

export default defineConfig(({ mode }) => ({
  // Admin page is intentionally not linked from the UI and not documented publicly.
  // To include it in production builds, set VITE_EMIT_ADMIN=1 at build time.
  // (Useful for self-hosted deployments where operators need online admin tools.)
  // Example: cross-env VITE_EMIT_ADMIN=1 vite build
  // GitHub Pages deployment uses a repo-scoped base like `/<repo>/`.
  // Only use that base in production; use `/` for local development.
  base: mode === "production" ? "/StackWorks/" : "/",
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
  plugins: [stockfishPublicCopyPlugin()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, "src/index.html"),
        ...(process.env.VITE_EMIT_ADMIN === "1" ? { admin: path.resolve(__dirname, "src/admin.html") } : {}),
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
        damascaHelp: path.resolve(__dirname, "src/damasca-help.html"),
        startHelp: path.resolve(__dirname, "src/start-help.html"),
      },
    },
  },
}));
