import test from "node:test";
import assert from "node:assert/strict";
import { attachScreen, screenSnapshot, legacyTemplateTest, boardTemplateResponse, photoFitStyle, quotaResetLabels } from "../src/screen.js";

test("weekly reset labels use Beijing time and handle expired or missing data", () => {
  const now = Date.parse("2026-09-17T08:32:12Z");
  const labels = quotaResetLabels("2026-09-19T08:32:12Z", now);
  assert.match(labels.resetTime, /9\/19 16:32/);
  assert.equal(labels.resetCountdown, "距重置 2天 0小时 0分");
  assert.match(quotaResetLabels("2026-09-16T08:32:12Z", now).resetCountdown, /等待同步/);
  assert.match(quotaResetLabels(null, now).resetTime, /暂不可用/);
  assert.match(quotaResetLabels("2026-09-19T08:32:12Z", now, true).resetCountdown, /历史快照/);
});

test("B06 keeps landscape, portrait and square photographs proportional", () => {
  assert.equal(photoFitStyle(4000, 3000), "width:480px;height:360px;left:80px;top:0px;");
  assert.equal(photoFitStyle(3000, 4000), "width:270px;height:360px;left:185px;top:0px;");
  assert.equal(photoFitStyle(1000, 1000), "width:360px;height:360px;left:140px;top:0px;");
  assert.equal(photoFitStyle(4000, 2000), "width:640px;height:320px;left:0px;top:20px;");
  assert.equal(photoFitStyle(undefined, 10), "width:0px;height:0px;");
});

test("board template uses proven render protocol and protected snapshot URL", () => {
  assert.throws(() => boardTemplateResponse("TEST", {}, { origin: "https://example.com" }));
  const result = boardTemplateResponse("TEST", { remaining: "42%", headline: "Test", photos: [] }, { origin: "https://example.com", token: "test-token" });
  const render = result.returnValue.gwCommands[1];
  assert.equal(render.payload.pageType, "TPL.RenderTemplate");
  assert.equal(render.payload.data.template, "TEST");
  assert.equal(render.payload.data.dataSource.remaining, "42%");
  assert.match(render.payload.data.dataSource.snapshotUrl, /view=test-token$/);
});

test("legacy test renders only the named sample without private data", () => {
  const output = legacyTemplateTest({requestData: {screenStatus: "online"}}, "MY_BOARD_TEST");
  const render = output.returnValue.gwCommands[1];
  assert.equal(render.payload.pageType, "TPL.RenderTemplate");
  assert.equal(render.payload.data.template, "MY_BOARD_TEST");
  assert.deepEqual(render.payload.data.dataSource, {text: "Hello World"});
  assert.equal(legacyTemplateTest({}, "MY_BOARD_TEST").returnValue.gwCommands.length, 1);
});

test("fresh weekly data and first image are available before page network initialization", () => {
  const now = Date.parse("2026-09-17T09:00:00Z");
  const snapshot = screenSnapshot({}, { sources: { codex: { updatedAt: new Date(now).toISOString(), metrics: [{ id: "codex-weekly", remainingPercent: 55 }] } } }, [{ id: "a", width:4000, height:3000 }, { id: "b", width:3000, height:4000 }, { id: "unreadable" }], { origin: "https://example.com", token: "test", now });
  assert.equal(snapshot.remaining, "55%");
  const response = boardTemplateResponse("TEST", snapshot, { origin: "https://example.com", token: "test" });
  const data = response.returnValue.gwCommands[1].payload.data.dataSource;
  assert(snapshot.photos.some(photo => photo.url === data.photoUrl));
  assert.equal(data.photoStyle, snapshot.photos.find(photo => photo.url === data.photoUrl).style);
  assert.equal(data.photoStatus, snapshot.photos.find(photo => photo.url === data.photoUrl).caption);
});

test("screen uses main weekly metric and labels stale snapshots", () => {
  const data = screenSnapshot({ week: "W38", status: "needs_confirmation", headline: "待锁定" }, {
    updatedAt: "2026-09-01T00:00:00Z", sources: { codex: { metrics: [
      { id: "five-hour", remainingPercent: 99 }, { id: "codex-weekly", remainingPercent: 42 }
    ] } }
  }, [{ id: "a", width:4000, height:3000 }], { origin: "https://example.com", token: "test-token", now: Date.parse("2026-09-16") });
  assert.equal(data.remaining, "--");
  assert.match(data.usageNote, /历史快照/);
  assert.match(data.photos[0].url, /view=test-token/);
});

test("explicit sample override sends Render even when screen status is missing", () => {
  for (const request of [{}, { requestData: { screenStatus: "offline" } }]) {
    const output = legacyTemplateTest(request, "MY_BOARD_TEST", { forceRender: true });
    assert.deepEqual(output.returnValue.gwCommands.map(command => command.commandName), ["Speak", "Render"]);
    assert.equal(output.returnValue.gwCommands[1].payload.data.template, "MY_BOARD_TEST");
    assert.match(output.returnValue.reply, /发送屏显测试指令/);
  }
  assert.match(legacyTemplateTest({}, "MY_BOARD_TEST").returnValue.reply, /只测试语音/);
});

test("screen commands only attach for enabled, authenticated screen configuration", () => {
  const reply = () => ({ returnValue: { reply: "已打开" } });
  const options = { enabled: true, token: "test-token", origin: "https://example.com" };
  assert.equal(attachScreen(reply(), {}, options).returnValue.gwCommands, undefined);
  assert.equal(attachScreen(reply(), { requestData: { screenStatus: "online" } }, { ...options, enabled: false }).returnValue.gwCommands, undefined);
  const output = attachScreen(reply(), { requestData: { screenStatus: "online" } }, options);
  assert.equal(output.returnValue.gwCommands[1].payload.pageType, "TPL.RenderDocument");
  assert.match(output.returnValue.gwCommands[1].payload.data.dataSource.snapshotUrl, /api\/screen\?view=/);
});
