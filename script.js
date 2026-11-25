// Supabase's anon key is a public client identifier, not an administrative key.
const api = 'https://br-sure-dodo-5b6229c3.supabase.aidap-global.cn-shanghai.volces.com/functions/v1/daily-menu-site';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1wbGF0Zm9ybSIsInJvbGUiOiJhbm9uIiwiZXhwIjozNjkyODQ2MTc0fQ.2eImh6Dl-P3FXRBYzv278u1iPh3NEBfVntdPTYYhjT8';
const headers = { authorization: `Bearer ${anonKey}` };
const categories = document.querySelectorAll('.category');
const grid = document.querySelector('.grid');
const status = document.querySelector('#status');
const pending = document.querySelector('#pending');
const pendingGrid = document.querySelector('#pending-grid');
const notice = document.querySelector('#notice');
const settings = document.querySelector('#settings');
const connectionBadge = document.querySelector('#connection-badge');
const connectionDetail = document.querySelector('#connection-detail');
const checkConnection = document.querySelector('#check-connection');
const menuPage = document.querySelector('#menu-page');
const openSettings = document.querySelector('#open-settings');
const closeSettings = document.querySelector('#close-settings');
let menuScrollY = 0;
function showPage(isSettings) {
  const wasSettings = !settings.hidden;
  if (isSettings && !wasSettings) menuScrollY = window.scrollY;
  settings.hidden = !isSettings;
  menuPage.hidden = isSettings;
  if (wasSettings && !isSettings) settings.dispatchEvent(new Event('settingsleave'));
  window.scrollTo(0, isSettings ? 0 : menuScrollY);
  (isSettings ? closeSettings : openSettings).focus({preventScroll:true});
}
openSettings.addEventListener('click', () => {
  history.pushState({page:'settings'}, '', '#settings');
  showPage(true);
});
closeSettings.addEventListener('click', () => {
  if (history.state?.page === 'settings') history.back();
  else { history.replaceState(null, '', location.pathname + location.search); showPage(false); }
});
window.addEventListener('popstate', () => showPage(location.hash === '#settings'));
if (location.hash === '#settings') showPage(true);
checkConnection.addEventListener('click', () => load());
function connectionState(state, detail) {
  connectionBadge.textContent = state;
  connectionBadge.classList.toggle('success', state === '可连接');
  connectionBadge.classList.toggle('error', state === '连接失败');
  connectionDetail.textContent = detail;
  checkConnection.disabled = state === '检查中';
}
let filter = 'meat', noticeTimer, refreshTimer, refreshAttempts = 0, playbackRequest = 0;
const categoryPositions = new Map();
const imageLoaders = new WeakMap();
const imageObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    imageObserver.unobserve(entry.target);
    imageLoaders.get(entry.target)?.();
  }
}, {rootMargin: '200px'}) : null;
const imageCache = 'caches' in window ? caches.open('daily-menu-images-v1').catch(() => null) : Promise.resolve(null);
const imageCacheLifetime = 24 * 60 * 60 * 1000;
function announce(message) { notice.textContent = message; notice.classList.add('visible'); clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3000); }
function applyFilter() {
  let shown = 0;
  grid.querySelectorAll('.card').forEach(card => {
    card.hidden = card.dataset.category !== filter;
    if (!card.hidden) shown++;
    if (!imageObserver && !card.hidden) imageLoaders.get(card)?.();
  });
  if (!imageObserver && !pending.hidden) pendingGrid.querySelectorAll('.card').forEach(card => imageLoaders.get(card)?.());
  status.textContent = shown ? '' : '这个分类还没有菜品';
  status.hidden = shown > 0;
}
function selectCategory(next) {
  if (next === filter) return;
  categoryPositions.set(filter, window.scrollY);
  filter = next;
  categories.forEach(item => { const selected = item.dataset.filter === filter; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
  if (status.textContent !== '正在加载菜库…') applyFilter();
  window.scrollTo(0, categoryPositions.get(filter) ?? 0);
}
categories.forEach(button => button.addEventListener('click', () => selectCategory(button.dataset.filter)));
let swipeStart = null;
menuPage.addEventListener('touchstart', event => {
  if (event.touches.length !== 1) { swipeStart = null; return; }
  const touch = event.touches[0];
  swipeStart = {x: touch.clientX, y: touch.clientY};
}, {passive: true});
menuPage.addEventListener('touchcancel', () => { swipeStart = null; });
menuPage.addEventListener('touchend', event => {
  if (!swipeStart || event.changedTouches.length !== 1) { swipeStart = null; return; }
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStart.x, dy = touch.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) < 60 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
  const index = Array.from(categories).findIndex(button => button.dataset.filter === filter);
  const next = categories[index + (dx < 0 ? 1 : -1)];
  if (!next) return;
  if (event.cancelable) event.preventDefault();
  selectCategory(next.dataset.filter);
}, {passive: false});
async function mediaUrl(id, kind) {
  const url = `${api}?id=${encodeURIComponent(id)}&kind=${kind}`;
  const cache = await imageCache;
  if (cache) {
    try {
      const cached = await cache.match(url);
      const savedAt = Number(cached?.headers.get('x-daily-menu-cached-at'));
      if (cached && savedAt > 0 && Date.now() - savedAt < imageCacheLifetime) return URL.createObjectURL(await cached.blob());
      if (cached) await cache.delete(url);
    } catch { /* Cache access is optional. */ }
  }
  const response = await fetch(url, {headers, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error('media unavailable');
  const blob = await response.blob();
  if (cache) {
    const saved = new Response(blob, {headers: {'content-type': blob.type || 'application/octet-stream', 'x-daily-menu-cached-at': String(Date.now())}});
    cache.put(url, saved).catch(() => {});
  }
  return URL.createObjectURL(blob);
}
function makeCard(dish) {
  const card = document.createElement('button'); card.type = 'button'; card.className = 'card';
  card.dataset.category = dish.category; card.setAttribute('aria-label', `播放菜名：${dish.name}`);
  const visual = document.createElement('div'); visual.className = 'card-visual'; visual.setAttribute('aria-hidden','true');
  const placeholder = document.createElement('span'); placeholder.className = 'placeholder'; placeholder.textContent = '暂无图片'; visual.append(placeholder);
  const imageId = Number.isSafeInteger(dish.image_id) && dish.image_id > 0 ? dish.image_id : dish.id;
  if (dish.image) {
    let started = false;
    placeholder.textContent = '图片加载中…';
    imageLoaders.set(card, () => {
      if (started) return;
      started = true;
      mediaUrl(imageId, 'image').then(url => {
        const img = document.createElement('img'); img.alt = '';
        img.onload = () => { placeholder.remove(); URL.revokeObjectURL(url); };
        img.onerror = () => { placeholder.textContent = '暂无图片'; img.remove(); URL.revokeObjectURL(url); };
        img.src = url; visual.append(img);
      }).catch(() => { placeholder.textContent = '暂无图片'; });
    });
    if (imageObserver) imageObserver.observe(card);
  }
  const info = document.createElement('span'); info.className = 'card-info';
  const name = document.createElement('span'); name.className = 'card-name'; name.textContent = dish.name;
  const play = document.createElement('span'); play.className = 'play'; play.setAttribute('aria-hidden','true');
  play.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10v4h3l4 3V7l-4 3H4ZM15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  info.append(name, play); card.append(visual, info);
  card.addEventListener('click', () => {
    const request = ++playbackRequest;
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      announce('当前浏览器不支持系统语音');
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(dish.name);
      utterance.lang = 'zh-CN';
      utterance.onerror = event => {
        if (request === playbackRequest && !['canceled', 'interrupted'].includes(event.error)) announce('语音播放失败，请检查手机声音并重试');
      };
      window.speechSynthesis.speak(utterance);
    } catch { announce('语音播放失败，请检查手机声音并重试'); }
  });
  return card;
}
async function load() {
  status.hidden = false; status.textContent = '正在加载菜库…';
  connectionState('检查中', '正在读取菜库…');
  try {
    const response = await fetch(api, {headers, signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error('unavailable');
    const dishes = await response.json();
    if (!Array.isArray(dishes)) throw new Error('invalid data');
    const valid = dishes.filter(d => Number.isSafeInteger(d.id) && d.id > 0 && typeof d.name === 'string');
    connectionState('可连接', `菜库读取成功 · ${new Date().toLocaleString('zh-CN', { hour12: false })}`);
    imageObserver?.disconnect();
    grid.replaceChildren(...valid.filter(d => ['meat', 'vegetable', 'soup'].includes(d.category)).map(makeCard));
    const uncertain = valid.filter(d => !['meat', 'vegetable', 'soup'].includes(d.category));
    pendingGrid.replaceChildren(...uncertain.map(makeCard));
    pending.hidden = uncertain.length === 0;
    applyFilter();
    clearTimeout(refreshTimer);
    if (valid.some(d => d.class_pending) && refreshAttempts++ < 5) refreshTimer = setTimeout(load, 12000);
    else if (!valid.some(d => d.class_pending)) refreshAttempts = 0;
  } catch {
    connectionState('连接失败', '未能读取菜库，请检查网络后重试。无法仅凭此判断数据库是否休眠。');
    status.replaceChildren(document.createTextNode('菜库暂时无法加载，请稍后重试。 '));
    const retry = document.createElement('button'); retry.className = 'retry'; retry.textContent = '重新加载'; retry.addEventListener('click', load); status.append(retry);
  }
}
load();
