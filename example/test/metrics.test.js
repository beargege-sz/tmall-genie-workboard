import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSource, createMetricStore } from "../src/metrics.js";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

test("sanitizes a generic metric source and clamps percentages", () => {
  const source = sanitizeSource({
    label: "Codex",
    status: "ok",
    metrics: [{ id: "weekly", label: "7 天", usedPercent: 117 }]
  });
  assert.equal(source.metrics[0].usedPercent, 100);
  assert.equal(source.metrics[0].remainingPercent, 0);
});

test("limits the number of metrics accepted from one source", () => {
  const source = sanitizeSource({ metrics: Array.from({ length: 30 }, (_, index) => ({ id: String(index) })) });
  assert.equal(source.metrics.length, 20);
});

test("successful source updates get their own timestamp", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "workboard-metrics-test-"));
  try {
    const store = createMetricStore(path.join(dir, "metrics.json"), new URL("../data/metrics.example.json", import.meta.url));
    await store.updateSource("codex", { metrics: [{ id: "codex-weekly", usedPercent: 45 }] });
    const result = await store.read();
    assert.equal(result.sources.codex.updatedAt, result.updatedAt);
    assert.equal(result.sources.codex.metrics[0].remainingPercent, 55);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
