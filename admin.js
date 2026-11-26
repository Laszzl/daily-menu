const adminBadge = document.querySelector('#admin-badge');
const adminMessage = document.querySelector('#admin-message');
const adminLogin = document.querySelector('#admin-login');
const adminRefresh = document.querySelector('#admin-refresh');
const adminResults = document.querySelector('#admin-results');
const adminLogout = document.querySelector('#admin-logout');
const adminPassword = document.querySelector('#admin-password');
const adminEmail = document.querySelector('#admin-email');
const adminProtected = document.querySelector('#admin-protected');
const adminWorklist = document.querySelector('#admin-worklist');
const projectBase = api.replace('/functions/v1/daily-menu-site','');
let adminToken = null, adminGeneration = 0, adminLoadSequence = 0;
const kindNames = {classification:'分类',dedupe:'查重',image:'图片'};
const stateNames = {pending:'等待',running:'处理中',done:'完成',needs_review:'待检查'};
const scheduleNames = {'daily-menu-ai-dispatch':'图片与查重', 'daily-menu-classification-dispatch':'分类'};
const item = (tag, value, className) => { const el = document.createElement(tag); if (className) el.className = className; el.textContent = value; return el; };
const formatTime = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', {hour12:false}) : '暂无记录';
function renderAdmin(data) {
  adminResults.replaceChildren();
  const schedules = document.createElement('div'); schedules.className = 'setting-row';
  schedules.append(item('strong','定时任务'));
  if (!data.schedules.length) schedules.append(item('p','没有读取到调度配置。'));
  for (const s of data.schedules) schedules.append(item('p', `${scheduleNames[s.name] || '后台任务'}：${s.active ? '已启用' : '已停用'}${s.schedule === '* * * * *' ? ' · 每分钟' : ''} · 最近执行 ${formatTime(s.last_started)}${s.last_status ? ' · ' + (s.last_status === 'succeeded' ? '执行成功' : '执行未成功') : ''}`));
  schedules.append(item('p','调度执行成功不代表每类任务都在派发或已经完成。图片派发状态未单独提供；数据库休眠期间是否执行仍未验证。'));
  const jobs = document.createElement('div'); jobs.className = 'setting-row'; jobs.append(item('strong','任务队列'));
  for (const kind of ['classification','dedupe','image']) {
    const matches = data.jobs.filter(j => j.kind === kind);
    if (matches.length) jobs.append(item('p', `${kindNames[kind]}：${matches.map(j => `${stateNames[j.state] || j.state} ${j.count}`).join(' · ')}`));
  }
  jobs.append(item('p', `已关联媒体：图片 ${data.media.image}。历史任务完成不代表文件仍存在。`));
  adminResults.append(schedules,jobs); adminResults.hidden = false;
}
async function loadAdmin() {
  if (!adminToken) return;
  const generation = adminGeneration, sequence = ++adminLoadSequence;
  const isCurrent = () => generation === adminGeneration && sequence === adminLoadSequence;
  adminMessage.textContent = '正在读取后台状态…'; adminRefresh.disabled = true;
  try {
    const response = await adminRpc('menu_site_admin_status', {});
    if (!isCurrent()) return;
    if ([401,403].includes(response.status)) { lockAdmin('账号无权管理菜库或登录已过期。'); return; }
    if (!response.ok) throw new Error('unavailable');
    const data = await response.json();
    if (!isCurrent()) return;
    if (!Array.isArray(data.schedules) || !Array.isArray(data.jobs) || !Array.isArray(data.review) || !data.media) throw new Error('invalid');
    adminBadge.textContent = '已解锁'; adminLogin.hidden = true; adminRefresh.hidden = false; adminLogout.hidden = false; adminProtected.hidden = false;
    adminMessage.textContent = `更新于 ${formatTime(data.checked_at)}`;
    renderAdmin(data);
    renderHistory({root:document.querySelector('#admin-history'),rpc:adminRpc,isCurrent});
    adminWorklist.replaceChildren(item('p','正在读取待处理事项…','hint'));
    try {
      const response = await adminRpc('menu_site_admin_worklist', {});
      if (!response.ok) throw new Error('unavailable');
      const work = await response.json();
      if (!isCurrent()) return;
      if (!Array.isArray(work.classification_review) || !Array.isArray(work.candidates) || !Number.isFinite(work.classification_review_count) || !Number.isFinite(work.candidate_count)) throw new Error('invalid');
      renderWorklist({data:work,status:data,root:adminWorklist,rpc:adminRpc,isCurrent,refresh:loadAdmin,onSaved:(message,refreshMenu)=>{if(generation === adminGeneration) { announce(message); if(refreshMenu) load(); }}});
    } catch { if (isCurrent()) adminWorklist.replaceChildren(item('p','待处理事项暂时无法读取，请刷新后重试。','hint')); }
  } catch { if (isCurrent()) { adminBadge.textContent = '暂不可用'; adminResults.hidden = true; adminRefresh.hidden = false; adminMessage.textContent = '无法读取管理状态，请稍后重试。'; } }
  finally { if (isCurrent()) adminRefresh.disabled = false; }
}
function adminRpc(name, body) {
  return fetch(`${projectBase}/rest/v1/rpc/${name}`, {method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${adminToken}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
}
function lockAdmin(message = '输入管理员账号和密码以查看任务与调度状态。') {
  adminGeneration++; adminToken = null; adminPassword.value = ''; adminLogin.hidden = false;
  adminResults.hidden = true; adminRefresh.hidden = true; adminLogout.hidden = true; adminProtected.hidden = true;
  adminBadge.textContent = '已锁定'; adminMessage.textContent = message;
}
adminLogin.addEventListener('submit', async event => {
  event.preventDefault();
  const generation = ++adminGeneration;
  const button = adminLogin.querySelector('button'); button.disabled = true; adminMessage.textContent = '正在登录…';
  try {
    const response = await fetch(`${projectBase}/auth/v1/token?grant_type=password`, {method:'POST',headers:{apikey:anonKey,'content-type':'application/json'},body:JSON.stringify({email:adminEmail.value.trim(),password:adminPassword.value}),signal:AbortSignal.timeout(20000)});
    adminPassword.value = '';
    if (generation !== adminGeneration) return;
    if (!response.ok) { lockAdmin(response.status === 429 ? '尝试次数过多，请稍后重试。' : '登录失败，请检查账号和密码。'); return; }
    const session = await response.json();
    if (generation !== adminGeneration) return;
    if (typeof session.access_token !== 'string') throw new Error('invalid session');
    adminToken = session.access_token; await loadAdmin();
  } catch { if (generation === adminGeneration) lockAdmin('暂时无法登录，请检查网络后重试。'); }
  finally { adminPassword.value = ''; button.disabled = false; }
});
adminRefresh.addEventListener('click', loadAdmin);
adminLogout.addEventListener('click', () => lockAdmin());
settings.addEventListener('settingsleave', () => lockAdmin());
