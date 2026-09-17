import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nextWeekTasks, journalDate, createJournalStore } from '../src/journal.js';
import { journalScreen } from '../src/screen.js';

test('extract next-week tasks only, retaining detail and skipping completed tasks', () => {
  const result = nextWeekTasks('## 本周\n- [ ] 不取\n## 下周方向\n- [ ] **项目一**：完整说明\n- [x] 已完成\n- 第二项\n## 其他\n- 不取');
  assert.equal(result.found,true);
  assert.deepEqual(result.tasks.map(x=>x.title),['项目一','第二项']);
  assert.equal(result.tasks[0].description,'项目一：完整说明');
  assert.equal(journalDate('2026年09月13日 周记.md'),'2026-09-13');
  assert.equal(journalDate('2026年初总结.md'),null);
});
test('latest journal is chosen by date, never silently falls back to older tasks', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(),'workboard-journal-'));
  try {
    await writeFile(path.join(dir,'2026年09月06日 周记.md'),'## 下周方向\n- 旧事项');
    await writeFile(path.join(dir,'2026年09月13日 周记.md'),'## 本周回顾\n正文');
    await writeFile(path.join(dir,'2026年09月20日 草稿.md'),'## 下周方向\n- 未来事项');
    const data = await createJournalStore(dir,{now:()=>Date.parse('2026-09-17')}).read();
    assert.equal(data.source.date,'2026-09-13');
    assert.equal(data.status,'missing_section');
    assert.equal(data.commitments.length,0);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('twelve fixed slots stay in source order without pagination', () => {
  const strategy={commitments:Array.from({length:10},(_,i)=>({title:`事项${i+1}`})),source:{date:'2026-09-13'}};
  assert.equal(journalScreen(strategy,0).headline,'1. 事项1');
  assert.equal(journalScreen(strategy,0).todo6,'6. 事项6');
  assert.equal(journalScreen(strategy,0).todo9,'9. 事项9');
  assert.equal(journalScreen(strategy,60000).todo1,'1. 事项1');
  assert.equal(journalScreen(strategy,60000).todo10,'10. 事项10');
  assert.equal(journalScreen(strategy,60000).todo12,'');
  assert.deepEqual(journalScreen(strategy,0),journalScreen(strategy,60000));
  strategy.commitments = Array.from({length:13},(_,i)=>({title:`事项${i+1}`}));
  assert.equal(journalScreen(strategy,0).todo12,'12. 事项12');
  assert.match(journalScreen(strategy,0).week,/显示前12项/);
});
