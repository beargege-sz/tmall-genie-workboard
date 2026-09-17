import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { imageSizeFromFile } from "image-size/fromFile";
import path from "node:path";
import sharp from 'sharp';
import { captionIndex, photoCaption } from './photo-captions.js';

const screenCache = new Map();
export async function screenPhoto(file) {
  const info = await stat(file);
  const key = `${file}:${info.size}:${info.mtimeMs}`;
  if (screenCache.has(key)) return screenCache.get(key);
  const pending = sharp(file).rotate().resize(640, 360, { fit: 'inside' }).flatten({ background: '#080e14' }).jpeg({ quality: 85, progressive: false }).toBuffer();
  screenCache.set(key, pending);
  if (screenCache.size > 80) screenCache.delete(screenCache.keys().next().value);
  try { return await pending; } catch (error) { screenCache.delete(key); throw error; }
}

const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const dimensionsCache = new Map();
async function dimensionsFor(file) {
  const info = await stat(file);
  const key = `${info.size}:${info.mtimeMs}`;
  if (dimensionsCache.get(file)?.key === key) return dimensionsCache.get(file).value;
  let value = {};
  try {
    const { width, height, orientation } = await imageSizeFromFile(file);
    const rotated = orientation >= 5 && orientation <= 8;
    value = { width: rotated ? height : width, height: rotated ? width : height };
  } catch { /* Retry incomplete iCloud files on next scan. */ }
  if (value.width && value.height) dimensionsCache.set(file, { key, value });
  return value;
}

export async function listPhotos(rootDirectory) {
  const photos = [];
  const captions = await captionIndex(path.dirname(rootDirectory));

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile() || !imageExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const relativePath = path.relative(rootDirectory, absolutePath);
      photos.push({
        id: createHash("sha256").update(relativePath).digest("hex").slice(0, 24),
        absolutePath,
        relativePath,
        caption: photoCaption(entry.name, captions.get(entry.name)),
        ...await dimensionsFor(absolutePath)
      });
    }
  }

  await walk(rootDirectory);
  return photos.sort((left, right) => left.relativePath.localeCompare(right.relativePath, "zh-CN"));
}

export function mimeTypeFor(filePath) {
  return ({
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  })[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
