import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import sharp from "sharp";

const uploadDirectory = new URL("../assets/uploads/", import.meta.url);

async function imageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return imageFiles(path);
    return /\.(avif|jpe?g|png|webp)$/i.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

function profile(path) {
  if (basename(path).startsWith("player-")) return { maximum: 900, quality: 72 };
  return { maximum: 1800, quality: 78 };
}

let before = 0;
let after = 0;
let changed = 0;

for (const path of await imageFiles(uploadDirectory.pathname)) {
  const original = await readFile(path);
  const { maximum, quality } = profile(path);
  const optimized = await sharp(original, { limitInputPixels: false })
    .rotate()
    .resize({ width: maximum, height: maximum, fit: "inside", withoutEnlargement: true })
    .webp({ quality, effort: 6, smartSubsample: true })
    .toBuffer();

  before += original.byteLength;
  if (optimized.byteLength < original.byteLength) {
    const temporary = `${path}.optimized${extname(path)}`;
    await writeFile(temporary, optimized);
    await rename(temporary, path);
    changed += 1;
  }
  after += (await stat(path)).size;
}

const megabytes = (bytes) => (bytes / 1024 / 1024).toFixed(1);
console.log(`Optimized ${changed} images: ${megabytes(before)} MB to ${megabytes(after)} MB.`);
