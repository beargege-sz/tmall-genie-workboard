export function legacyTemplateTest(request, template, { forceRender = false } = {}) {
  const shouldRender = forceRender || request.requestData?.screenStatus === "online";
  const reply = shouldRender ? "正在发送屏显测试指令。" : "没有收到屏幕在线状态，本次只测试语音。";
  const gwCommands = [{ commandDomain: "AliGenie.Speaker", commandName: "Speak",
    payload: { type: "text", text: reply, expectSpeech: false } }];
  if (shouldRender) {
    gwCommands.push({ commandDomain: "AliGenie.Screen", commandName: "Render",
      payload: { pageType: "TPL.RenderTemplate", pageTitle: "屏显测试",
        data: { template, dataSource: { text: "Hello World" } } } });
  }
  return { returnCode: "0", returnMessage: "success", returnValue: {
    reply, resultType: "RESULT", executeCode: "SUCCESS", gwCommands
  } };
}

export function boardTemplateResponse(template, snapshot, { origin, token }) {
  if (!template || !token) throw new Error("Missing private screen configuration");
  const reply = "正在打开个人工作台。";
  const first = snapshot.photos?.[Math.floor(Math.random() * (snapshot.photos?.length || 1))];
  return { returnCode: "0", returnMessage: "success", returnValue: {
    reply, resultType: "RESULT", executeCode: "SUCCESS", gwCommands: [
      { commandDomain: "AliGenie.Speaker", commandName: "Speak", payload: { type: "text", text: reply, expectSpeech: false } },
      { commandDomain: "AliGenie.Screen", commandName: "Render", payload: {
        pageType: "TPL.RenderTemplate", pageTitle: "个人工作台",
        data: { template, dataSource: { ...snapshot,
          photoUrl: first?.url ?? "",
          photoStyle: first?.style ?? "width:0px;height:0px;",
          photoStatus: first?.caption ?? "未找到周记照片",
          snapshotUrl: `${origin}/api/screen?view=${encodeURIComponent(token)}` } }
      } }
    ]
  } };
}

export function attachScreen(response, request, { origin, token, enabled }) {
  if (!enabled || !token || request.requestData?.screenStatus !== "online") return response;
  response.returnValue.gwCommands = [
    { commandDomain: "AliGenie.Speaker", commandName: "Speak",
      payload: { type: "text", text: response.returnValue.reply, expectSpeech: false } },
    { commandDomain: "AliGenie.Screen", commandName: "Render", payload: {
      pageType: "TPL.RenderDocument", data: {
        pageTitle: "个人工作台",
        dataSource: { snapshotUrl: `${origin}/api/screen?view=${encodeURIComponent(token)}` },
        config: { header: { enabled: false }, body: { backgroundColor: "#101923" } }
      }
    } }
  ];
  return response;
}

export function screenSnapshot(strategy, monitoring, photos, { origin, token, now = Date.now() }) {
  const source = monitoring.sources?.codex;
  const metric = source?.metrics?.find(item => item.id === "codex-weekly");
  const stamp = source?.updatedAt ?? monitoring.updatedAt;
  const stampMs = Date.parse(stamp);
  const stale = !Number.isFinite(stampMs) || now - stampMs > 15 * 60_000;
  const date = Number.isFinite(stampMs)
    ? new Date(stampMs).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "时间未知";
  return {
    remaining: !stale && Number.isFinite(metric?.remainingPercent) ? `${metric.remainingPercent}%` : "--",
    ...quotaResetLabels(metric?.resetsAt, now, stale),
    usageNote: `${stale ? "历史快照" : "快照"} ${date}`,
    week: `${strategy.week ?? "本周战略"} · ${strategy.status === "needs_confirmation" ? "待锁定" : "已锁定"}`,
    headline: String(strategy.headline ?? "等待同步").slice(0, 42),
    focus: String(strategy.monthlyFocus ?? "").slice(0, 54),
    commitment: String(strategy.commitments?.[0]?.title ?? "").slice(0, 64),
    ...(strategy.kind === 'journal' ? journalScreen(strategy, now) : {}),
    status: stale ? "额度采集尚未实时同步 · 页面每分钟刷新" : "页面每分钟刷新 · 照片随机不重复轮换",
    photos: photos.filter(photo => photo.width > 0 && photo.height > 0).map(photo => ({ url: `${origin}/media/photos/${photo.id}?view=${encodeURIComponent(token)}&screen=1`, style: photoFitStyle(photo.width, photo.height), caption: photo.caption ?? '日期未记录 · 暂无照片说明' }))
  };
}

export function journalScreen(strategy, now) {
  const tasks = strategy.commitments ?? [];
  const item = index => {
    const task = tasks[index];
    if (!task) return '';
    const text = `${index + 1}. ${task.title}`;
    const limit = 19;
    return text.length > limit ? text.slice(0,limit-1) + '…' : text;
  };
  return {
    week: `周记 ${strategy.source?.date ?? '未连接'} · 下周待办 · ${tasks.length > 12 ? `显示前12项 / 共${tasks.length}项` : `${tasks.length}项`}`,
    headline: tasks.length ? item(0) : strategy.headline,
    focus: item(1), commitment: item(2),
    todo1: tasks.length ? item(0) : strategy.headline, todo2: item(1), todo3: item(2), todo4: item(3), todo5: item(4), todo6: item(5), todo7: item(6), todo8: item(7), todo9: item(8), todo10: item(9), todo11: item(10), todo12: item(11)
  };
}

export function quotaResetLabels(resetsAt, now, stale = false) {
  const reset = Date.parse(resetsAt);
  if (!Number.isFinite(reset)) return { resetTime: "重置时间暂不可用", resetCountdown: "等待额度数据同步" };
  const time = new Date(reset).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const resetTime = `重置 ${time}（北京时间）`;
  if (stale) return { resetTime, resetCountdown: "历史快照 · 待确认重置时间" };
  if (reset <= now) return { resetTime, resetCountdown: "已到重置时间 · 等待同步" };
  const minutes = Math.ceil((reset - now) / 60000);
  const days = Math.floor(minutes / 1440), hours = Math.floor(minutes % 1440 / 60), mins = minutes % 60;
  return { resetTime, resetCountdown: `距重置 ${days ? `${days}天 ` : ""}${hours}小时 ${mins}分` };
}

// B06 photo slot: explicit dimensions avoid unsupported native object-fit.
export function photoFitStyle(width, height) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) return "width:0px;height:0px;";
  const scale = Math.min(640 / width, 360 / height);
  const w = Math.round(width * scale), h = Math.round(height * scale);
  return `width:${w}px;height:${h}px;left:${Math.round((640-w)/2)}px;top:${Math.round((360-h)/2)}px;`;
}
