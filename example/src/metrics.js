import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

function numberInRange(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

function sanitizeMetric(metric) {
  const usedPercent = numberInRange(metric.usedPercent);
  return {
    id: String(metric.id ?? "metric").slice(0, 80),
    label: String(metric.label ?? "指标").slice(0, 120),
    usedPercent,
    remainingPercent: numberInRange(metric.remainingPercent, 100 - usedPercent),
    windowMinutes: Number.isFinite(Number(metric.windowMinutes)) ? Number(metric.windowMinutes) : null,
    resetsAt: metric.resetsAt ? String(metric.resetsAt) : null
  };
}

export function sanitizeSource(source) {
  if (!source || typeof source !== "object") throw new Error("指标数据格式不正确");
  return {
    label: String(source.label ?? "监测数据").slice(0, 120),
    status: ["ok", "warning", "error", "waiting"].includes(source.status) ? source.status : "ok",
    summary: String(source.summary ?? "").slice(0, 240),
    metrics: Array.isArray(source.metrics) ? source.metrics.slice(0, 20).map(sanitizeMetric) : [],
    details: source.details && typeof source.details === "object" ? source.details : {}
  };
}

export function createMetricStore(filePath, fallbackPath) {
  async function read() {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT" || !fallbackPath) throw error;
      return JSON.parse(await readFile(fallbackPath, "utf8"));
    }
  }

  async function updateSource(sourceId, input) {
    if (!/^[a-z0-9_-]{1,40}$/i.test(sourceId)) throw new Error("数据源名称不正确");
    const dashboard = await read();
    dashboard.sources ??= {};
    dashboard.sources[sourceId] = sanitizeSource(input);
    dashboard.updatedAt = new Date().toISOString();
    dashboard.sources[sourceId].updatedAt = dashboard.updatedAt;
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(dashboard, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
    return dashboard.sources[sourceId];
  }

  return { read, updateSource };
}
