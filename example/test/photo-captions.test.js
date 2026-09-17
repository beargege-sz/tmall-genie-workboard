import test from 'node:test';
import assert from 'node:assert/strict';
import { photoCaption } from '../src/photo-captions.js';
test('captions distinguish filename dates from journal dates and do not use export timestamps', () => {
  assert.match(photoCaption('PXL_20260124_132211905.jpg',{date:'2026-01-26',summary:'创业训练营'}), /文件日期 2026-01-24 · 周记：创业训练营/);
  assert.match(photoCaption('mmexport1768174111917.jpg',{date:'2026-01-12',summary:'闭门会'}), /^周记 2026-01-12/);
  assert.equal(photoCaption('hash.jpg'), '日期未记录 · 暂无照片说明');
});
