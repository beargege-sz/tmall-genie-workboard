import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export function journalDate(name) {
  const m = /^(\d{4})(?:年|-)(\d{1,2})(?:月|-)(\d{1,2})(?:日|\b)/.exec(name);
  if (!m) return null;
  const value = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : null;
}

export function nextWeekTasks(markdown) {
  const lines = markdown.split(/\r?\n/);
  let level = 0, found = false, fenced = false;
  const tasks = [];
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!found) {
      if (heading && /下周.*(?:方向|待办|计划|事项)/.test(heading[2])) { found = true; level = heading[1].length; }
      continue;
    }
    if (heading && heading[1].length <= level) break;
    if (/^\s*---+\s*$/.test(line)) break;
    const item = /^\s*(?:[-*+] |\d+[.)]\s+)(?:\[([ xX])\]\s*)?(.+)$/.exec(line);
    if (!item || /x/i.test(item[1] || '')) continue;
    const raw = item[2].trim();
    const clean = raw.replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`]/g,'').trim();
    const bold = /^\*\*(.+?)\*\*/.exec(raw);
    tasks.push({ title: bold ? bold[1] : clean, description: clean, state: '待办' });
  }
  return { found, tasks };
}

export function createJournalStore(root, { now = () => Date.now() } = {}) {
  let cache, expires = 0;
  return { async read() {
    if (cache && now() < expires) return cache;
    try {
      const candidates = [];
      const today = new Date(now() + 8 * 3600000).toISOString().slice(0,10);
      async function walk(dir) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.')) continue;
          const file = path.join(dir, entry.name);
          if (entry.isDirectory() && !/照片|assets|附件/.test(entry.name)) await walk(file);
          const date = journalDate(entry.name);
          if (entry.isFile() && /\.md$/i.test(entry.name) && date && date <= today) candidates.push({ file, date });
        }
      }
      await walk(root);
      candidates.sort((a,b) => b.date.localeCompare(a.date) || a.file.localeCompare(b.file));
      const latest = candidates[0];
      if (!latest) throw new Error('no_journal');
      const { found, tasks } = nextWeekTasks(await readFile(latest.file, 'utf8'));
      cache = { kind: 'journal', week: latest.date, status: found ? 'ok' : 'missing_section',
        headline: !found ? '最新周记未找到下周待办章节' : tasks.length ? '下周待办' : '下周待办已完成或尚未填写',
        commitments: tasks, source: { journal: path.relative(root, latest.file), date: latest.date } };
    } catch {
      cache = { kind: 'journal', status: 'unavailable', headline: '周记暂不可读 · 等待 iCloud 同步', commitments: [] };
    }
    expires = now() + 60000;
    return cache;
  } };
}
