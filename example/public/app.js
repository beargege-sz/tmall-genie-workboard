const viewToken = new URLSearchParams(location.search).get('view');
const $ = selector => document.querySelector(selector);
let photos = [], queue = [], currentUrl = '', photoTimer, rotating = false;
let lastSuccess = 0;
function shuffle(items) {
  const output = [...items];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }
  return output;
}
function preload(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timeout = setTimeout(() => { image.src = ''; reject(new Error('timeout')); }, 20000);
    image.onload = () => { clearTimeout(timeout); resolve(); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('image')); };
    image.src = url;
  });
}
async function rotate() {
  if (rotating) return;
  rotating = true;
  clearTimeout(photoTimer);
  try {
    if (!queue.length) queue = shuffle(photos.filter(photo => photo.url !== currentUrl));
    for (let attempt = 0; queue.length && attempt < 3; attempt++) {
      const next = queue.shift();
      try {
        await preload(next.url);
        $('#journal-photo').src = next.url;
        $('#journal-photo').alt = next.caption || '周记照片';
        $('#journal-photo').hidden = false;
        $('#photo-placeholder').hidden = true;
        $('#photo-caption').textContent = next.caption || '';
        currentUrl = next.url;
        break;
      } catch { /* Keep the last successful image while trying another. */ }
    }
    if (!currentUrl) $('#photo-placeholder').textContent = photos.length ? '照片暂时无法加载，稍后重试' : '暂无周记照片';
  } finally {
    rotating = false;
    photoTimer = setTimeout(rotate, currentUrl ? 180000 + Math.random() * 120000 : 30000);
  }
}
function render(data) {
  $('#remaining').textContent = data.remaining;
  $('#reset-time').textContent = data.resetTime;
  $('#reset-countdown').textContent = data.resetCountdown;
  $('#usage-note').textContent = data.usageNote;
  $('#todos').replaceChildren(...Array.from({length:12}, (_, index) => {
    const item = document.createElement('div');
    item.className = 'todo';
    item.textContent = data['todo' + (index + 1)] || '';
    return item;
  }));
  const incoming = data.photos || [];
  const existing = new Set(photos.map(photo => photo.url));
  const urls = new Set(incoming.map(photo => photo.url));
  queue = queue.filter(photo => urls.has(photo.url));
  queue.push(...shuffle(incoming.filter(photo => !existing.has(photo.url))));
  photos = incoming;
  if (!photoTimer && !rotating) void rotate();
}
async function refresh() {
  try {
    const url = new URL('/api/screen', location.origin);
    if (viewToken) url.searchParams.set('view', viewToken);
    const response = await fetch(url, {cache:'no-store', signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? '请使用带私人访问凭证的工作台链接。' : '连接暂时中断，正在重试。');
    render(await response.json());
    lastSuccess = Date.now();
    $('#connection-error').hidden = true;
  } catch (error) {
    $('#connection-error').textContent = error.message?.startsWith('请使用') ? error.message : '连接暂时中断，正在重试。';
    $('#connection-error').hidden = false;
    if (!lastSuccess || Date.now() - lastSuccess > 15 * 60000) {
      $('#remaining').textContent = '--';
      $('#reset-countdown').textContent = '等待重新同步';
    }
  } finally { setTimeout(refresh, 60000); }
}
function tick() {
  const now = new Date();
  $('#clock').dateTime = now.toISOString();
  $('#clock').textContent = now.toLocaleString('zh-CN', {
    timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hour12:false
  });
}
tick();
setInterval(tick, 1000);
void refresh();
