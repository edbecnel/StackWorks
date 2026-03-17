import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

const srcDir = path.join(REPO_ROOT, "node_modules", "stockfish", "src");
const publicDir = path.join(REPO_ROOT, "public");
const outDir = path.join(publicDir, "vendor", "stockfish");

const FILES_TO_COPY = [
  "stockfish-17.1-lite-single-03e3232.js",
  "stockfish-17.1-lite-single-03e3232.wasm",
  "stockfish-17.1-asm-341ff22.js",
];

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
  const available = await Promise.all(
    FILES_TO_COPY.map(async (file) => ({ file, exists: await exists(path.join(srcDir, file)) })),
  );

  if (!available.find((entry) => entry.file === "stockfish-17.1-lite-single-03e3232.js")?.exists) {
    // Stockfish is a devDependency used only by the frontend build.
    // In server-only environments (e.g. Render deploying server/) the package
    // is not installed — skip silently rather than failing the build.
    console.log("[postinstall] Stockfish not found — skipping copy (server-only environment).");
    return;
  }
  if (!available.find((entry) => entry.file === "stockfish-17.1-lite-single-03e3232.wasm")?.exists) {
    console.log("[postinstall] Stockfish WASM not found — skipping copy (server-only environment).");
    return;
  }

  const missingFiles = available.filter((entry) => !entry.exists).map((entry) => entry.file);
  if (missingFiles.length > 0) {
    throw new Error(`Missing Stockfish assets: ${missingFiles.join(", ")}`);
  }

  await fs.mkdir(outDir, { recursive: true });

  const copied = await Promise.all(
    FILES_TO_COPY.map((file) =>
      copyIfChanged(path.join(srcDir, file), path.join(outDir, file)),
    ),
  );

  if (copied.some(Boolean)) {
    // eslint-disable-next-line no-console
    console.log(`[postinstall] Copied Stockfish to ${path.relative(REPO_ROOT, outDir)}`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[postinstall] Failed to copy Stockfish assets", e);
  process.exitCode = 1;
});
