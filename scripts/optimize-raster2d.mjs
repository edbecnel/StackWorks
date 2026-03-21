import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const PIECES_DIR = path.join(ROOT, "public", "pieces", "raster3d");
const FILE_PATTERN = /_(?:2D)\.png$/i;
const PNG_OPTIONS = {
  compressionLevel: 9,
  effort: 10,
  palette: true,
  quality: 85,
  adaptiveFiltering: true,
};

async function main() {
  const entries = await fs.readdir(PIECES_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (!files.length) {
    console.log("No raster 2D piece PNGs found under public/pieces/raster3d/.");
    return;
  }

  let totalBefore = 0;
  let totalAfter = 0;

  for (const name of files) {
    const filePath = path.join(PIECES_DIR, name);
    const tempPath = `${filePath}.tmp`;
    const before = (await fs.stat(filePath)).size;

    await sharp(filePath, { failOn: "none" })
      .png(PNG_OPTIONS)
      .toFile(tempPath);

    const after = (await fs.stat(tempPath)).size;

    if (after < before) {
      await fs.rename(tempPath, filePath);
      totalAfter += after;
      console.log(`${name}: ${before} -> ${after} bytes`);
    } else {
      await fs.rm(tempPath, { force: true });
      totalAfter += before;
      console.log(`${name}: kept existing ${before} bytes`);
    }

    totalBefore += before;
  }

  const saved = totalBefore - totalAfter;
  const percent = totalBefore > 0 ? ((saved / totalBefore) * 100).toFixed(1) : "0.0";

  console.log(`\nOptimized ${files.length} raster 2D piece PNGs.`);
  console.log(`Total: ${totalBefore} -> ${totalAfter} bytes (${percent}% saved)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
