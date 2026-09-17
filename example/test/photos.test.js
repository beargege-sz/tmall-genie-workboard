import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listPhotos, mimeTypeFor } from "../src/photos.js";

test("lists supported photos recursively and ignores audio", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "workboard-photos-"));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "one.jpg"), "one");
  await writeFile(path.join(root, "nested", "two.jpeg"), "two");
  await writeFile(path.join(root, "voice.mp3"), "audio");
  const photos = await listPhotos(root);
  assert.equal(photos.length, 2);
  assert.equal(photos[0].id.length, 24);
  assert.equal(mimeTypeFor(photos[0].absolutePath), "image/jpeg");
});
