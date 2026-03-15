import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const srcDir = path.join(REPO_ROOT, "node_modules", "stockfish", "src");
const publicDir = path.join(REPO_ROOT, "public");
const outDir = path.join(publicDir, "vendor", "stockfish");

const WORKER_FILE = "stockfish-17.1-lite-single-03e3232.js";
const WASM_FILE = "stockfish-17.1-lite-single-03e3232.wasm";

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfChanged(srcPath, destPath) {
  const [srcStat, destStat] = await Promise.all([
    fs.stat(srcPath),
    fs.stat(destPath).catch(() => null),
  ]);

  // Cheap change detection: size + mtime.
  if (destStat && destStat.size === srcStat.size && destStat.mtimeMs >= srcStat.mtimeMs) {
    return false;
  }

  await fs.copyFile(srcPath, destPath);
  return true;
}

async function main() {
  const workerSrc = path.join(srcDir, WORKER_FILE);
  const wasmSrc = path.join(srcDir, WASM_FILE);

  if (!(await exists(workerSrc))) {
    // Stockfish is a devDependency used only by the frontend build.
    // In server-only environments (e.g. Render deploying server/) the package
    // is not installed — skip silently rather than failing the build.
    console.log("[postinstall] Stockfish not found — skipping copy (server-only environment).");
    return;
  }
  if (!(await exists(wasmSrc))) {
    console.log("[postinstall] Stockfish WASM not found — skipping copy (server-only environment).");
    return;
  }

  await fs.mkdir(outDir, { recursive: true });

  const workerOut = path.join(outDir, WORKER_FILE);
  const wasmOut = path.join(outDir, WASM_FILE);

  const [workerCopied, wasmCopied] = await Promise.all([
    copyIfChanged(workerSrc, workerOut),
    copyIfChanged(wasmSrc, wasmOut),
  ]);

  if (workerCopied || wasmCopied) {
    // eslint-disable-next-line no-console
    console.log(`[postinstall] Copied Stockfish to ${path.relative(REPO_ROOT, outDir)}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[postinstall] Failed to copy Stockfish assets", e);
  process.exitCode = 1;
});
