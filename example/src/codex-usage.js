import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export function weeklySource(result) {
  const bucket = result.rateLimitsByLimitId ? result.rateLimitsByLimitId.codex : result.rateLimits;
  const window = [bucket?.primary, bucket?.secondary].find(w => w?.windowDurationMins === 10080);
  if (!window || typeof window.usedPercent !== 'number' || !Number.isFinite(window.usedPercent)) throw new Error('weekly_window_unavailable');
  const used = Math.max(0, Math.min(100, window.usedPercent));
  return { label: '主 Codex', status: 'ok', summary: '官方额度 · Mac mini 自动采集', metrics: [{
    id: 'codex-weekly', label: '本周余量', usedPercent: used, remainingPercent: 100 - used,
    windowMinutes: 10080, resetsAt: window.resetsAt ? new Date(window.resetsAt * 1000).toISOString() : null
  }] };
}

export async function readCodexUsage({ binary, authFile, expectedAccountHash, timeoutMs = 30000 }) {
  const auth = JSON.parse(await readFile(authFile, 'utf8'));
  const id = auth.tokens?.account_id;
  if (!id || !expectedAccountHash || createHash('sha256').update(id).digest('hex') !== expectedAccountHash) throw new Error('account_mismatch');
  return new Promise((resolve, reject) => {
    // Read-only RPC, no threads/turns, no login tokens leave the installed Codex process.
    const child = spawn(binary, ['app-server', '--listen', 'stdio://'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = createInterface({ input: child.stdout });
    let done = false;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 2000);
      killTimer.unref();
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('quota_timeout')), timeoutMs);
    const send = message => child.stdin.write(JSON.stringify(message) + '\n');
    child.on('error', () => finish(new Error('codex_start_failed')));
    child.stdin.on('error', () => finish(new Error('codex_pipe_failed')));
    child.on('exit', () => { if (!done) finish(new Error('codex_early_exit')); });
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.id !== 1 && message.id !== 2) return;
      if (message.error) return finish(new Error('codex_rpc_failed'));
      if (message.id === 1) {
        send({ method: 'initialized' });
        send({ id: 2, method: 'account/rateLimits/read' });
      } else {
        try { finish(null, weeklySource(message.result)); } catch (error) { finish(error); }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'workboard_usage', title: 'Workboard quota reader', version: '1.0.0' } } });
  });
}

export function startUsageCollector(store, options, intervalMs = 300000) {
  let running = false;
  const collect = async () => {
    if (running) return;
    running = true;
    try {
      const source = await readCodexUsage(options);
      await store.updateSource('codex', source);
      console.info('Codex quota collected', JSON.stringify({ at: new Date().toISOString(), remaining: source.metrics[0].remainingPercent }));
    } catch {
      // Preserve last successful timestamp; the board hides expired snapshots.
      console.warn('Codex quota collection failed; keeping last snapshot', new Date().toISOString());
    } finally { running = false; }
  };
  void collect();
  const timer = setInterval(collect, Math.max(60000, intervalMs));
  timer.unref();
  return () => clearInterval(timer);
}
