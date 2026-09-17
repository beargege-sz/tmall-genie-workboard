import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklySource } from '../src/codex-usage.js';
test('quota collector selects main Codex weekly window rather than model or five hour limits', () => {
  const result = weeklySource({ rateLimitsByLimitId: { codex: { primary: { usedPercent: 90, windowDurationMins: 300 }, secondary: { usedPercent: 44, windowDurationMins: 10080 } }, other: { primary: { usedPercent: 1, windowDurationMins: 10080 } } } });
  assert.equal(result.metrics[0].remainingPercent, 56);
  assert.throws(() => weeklySource({ rateLimitsByLimitId: { other: {} } }));
  assert.throws(() => weeklySource({ rateLimits: { primary: { usedPercent: null, windowDurationMins: 10080 } } }));
});
