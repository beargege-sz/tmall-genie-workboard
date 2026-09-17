import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { journalDate } from './journal.js';

const caches = new Map();
const clean = value => value.replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
export function photoCaption(name, reference) {
  const match = /^(?:PXL_|IMG_)?(20\d{2})(\d{2})(\d{2})[_-]/.exec(name);
  const date = match ? journalDate(`${match[1]}-${match[2]}-${match[3]}`) : null;
  const prefix = date ? `文件日期 ${date}` : reference?.date ? `周记 ${reference.date}` : '日期未记录';
  const summary = reference?.summary ? `周记：${reference.summary}` : '暂无照片说明';
  const text = `${prefix} · ${summary}`;
  return text.length > 46 ? text.slice(0,45) + '…' : text;
}

export async function captionIndex(directory) {
  const cached = caches.get(directory);
  if (cached && Date.now() < cached.expires) return cached.index;
  const index = new Map();
  try {
    const entries = (await readdir(directory)).filter(name => /\.md$/i.test(name) && journalDate(name)).sort();
    for (const name of entries) {
      const date = journalDate(name);
      const title = name.replace(/^\d{4}年\d{1,2}月\d{1,2}日\s*/, '').replace(/\.md$/i,'');
      const body = await readFile(path.join(directory,name),'utf8');
      for (const match of body.matchAll(/!\[\[([^\]]+)\]\]|!\[([^\]]*)\]\(([^)]+)\)/g)) {
        let target = (match[1] || match[3]).split('|')[0];
        try { target = decodeURIComponent(target); } catch {}
        const basename = path.basename(target);
        // Alt text is explicit author-provided context; grouped wiki images use the journal title.
        const summary = clean(match[2] && !/^(图片|照片|image)$/i.test(match[2]) ? match[2] : title);
        if (!index.has(basename)) index.set(basename, { date, summary });
      }
    }
  } catch { /* Missing iCloud text must not prevent photo loading. */ }
  caches.set(directory, { index, expires: Date.now()+60000 });
  return index;
}
