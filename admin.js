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
const settingsTabs=[...document.querySelectorAll('.settings-tab')];
const settingsPanels=[...document.querySelectorAll('[data-settings-panel]')];
settingsTabs.forEach(button=>button.addEventListener('click',()=>{
  const selected=button.dataset.panel;
  settingsTabs.forEach(tab=>tab.setAttribute('aria-pressed',String(tab===button)));
  settingsPanels.forEach(panel=>{panel.hidden=panel.dataset.settingsPanel!==selected;});
}));
let adminToken = null, adminGeneration = 0, adminLoadSequence = 0;
let usageSequence = 0;
const kindNames = {classification:'分类',dedupe:'查重',image:'图片'};
const stateNames = {pending:'等待',running:'处理中',done:'完成',needs_review:'待检查'};
const scheduleNames = {'daily-menu-ai-dispatch':'查重与已授权配图', 'daily-menu-classification-dispatch':'分类'};
const item = (tag, value, className) => { const el = document.createElement(tag); if (className) el.className = className; el.textContent = value; return el; };
const formatTime = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString('zh-CN', {hour12:false}) : '暂无记录';
async function loadUsage() {
  if (!adminToken) return;
  const generation=adminGeneration, sequence=++usageSequence;
  const current=()=>generation===adminGeneration && sequence===usageSequence;
  const root=document.querySelector('#admin-usage'), button=document.querySelector('#usage-refresh');
  button.disabled=true; root.replaceChildren(item('p','正在读取…','hint'));
  try {
    const [response, balances]=await Promise.all([
      adminRpc('menu_site_admin_usage',{}),
      fetch(`${projectBase}/functions/v1/daily-menu-balance`,{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${adminToken}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)}).then(r=>r.ok?r.json():null).catch(()=>null)
    ]);
    if(!response.ok) throw new Error('unavailable');
    const data=await response.json(); if(!current())return;
    if(!Number.isSafeInteger(data.classification_batches_total)||!Number.isSafeInteger(data.classification_batches_today)) throw new Error('invalid');
    const balanceText=(value)=>{
      if(!value || value.status==='unavailable') return '暂时无法读取';
      if(value.status==='not_configured') return '未接入';
      if(value.status!=='ok'||typeof value.available!=='string'||! /^-?\d+(?:\.\d+)?$/.test(value.available)||!['CNY','USD','JPY'].includes(value.currency)) return '暂时无法读取';
      return `${value.available} ${value.currency}`;
    };
    const ai=item('div',null,'usage-group');
    ai.append(item('strong','阿里云百炼'),
      item('p','AI 调用次数：暂无完整记录'),
      item('p',`分类请求批次：今日 ${data.classification_batches_today} · 累计 ${data.classification_batches_total}`),
      item('p','百炼费用：未接入'),item('p',`阿里云账户可用额度：${balanceText(balances?.ali)}`));
    const database=item('div',null,'usage-group');
    database.append(item('strong','火山引擎数据库'),
      item('p',`数据库进程本次启动：${formatTime(data.database_process_started_at)}`),
      item('p','数据库费用：未接入'),item('p',`火山引擎账户可用余额：${balanceText(balances?.volc)}`));
    root.replaceChildren(ai,database);
  } catch {if(current())root.replaceChildren(item('p','用量信息暂时无法读取，请稍后重试。','hint'));}
  finally {if(current())button.disabled=false;}
}
function renderAdmin(data, imageSummary) {
  adminResults.replaceChildren();
  const images = document.createElement('div'); images.className = 'setting-row';
  images.append(item('strong','AI 配图'),item('p','配图方式：手动选择'));
  if (imageSummary === undefined) images.append(item('p','正在读取配图状态…'));
  else if (imageSummary === null) images.append(item('p','配图状态暂时无法读取。'));
  else images.append(item('p',`等待选择 ${imageSummary.waiting} · 已授权处理中 ${imageSummary.generating} · 失败 ${imageSummary.failed}`));
  const schedules = document.createElement('div'); schedules.className = 'setting-row';
  schedules.append(item('strong','定时任务'));
  if (!data.schedules.length) schedules.append(item('p','没有读取到调度配置。'));
  for (const s of data.schedules) schedules.append(item('p', `${scheduleNames[s.name] || '后台任务'}：${s.active ? '已启用' : '已停用'}${s.schedule === '* * * * *' ? ' · 每分钟' : ''} · 最近执行 ${formatTime(s.last_started)}${s.last_status ? ' · ' + (s.last_status === 'succeeded' ? '执行成功' : '执行未成功') : ''}`));
  schedules.append(item('p','调度成功不代表任务已完成。')); 
  const jobs = document.createElement('div'); jobs.className = 'setting-row'; jobs.append(item('strong','任务队列'));
  for (const kind of ['classification','dedupe','image']) {
    const matches = data.jobs.filter(j => j.kind === kind);
    if (matches.length) jobs.append(item('p', `${kindNames[kind]}${kind==='image'?'生成任务':''}：${matches.map(j => `${stateNames[j.state] || j.state} ${j.count}`).join(' · ')}`));
  }
  jobs.append(item('p', `已关联图片：${data.media.image}`));
  adminResults.append(images,schedules,jobs); adminResults.hidden = false;
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
    loadUsage();
    renderAdmin(data);
    adminRpc('menu_site_admin_image_summary', {}).then(async response=>{
      if(!response.ok) throw new Error('unavailable');
      const summary=await response.json();
      if(!summary || !['waiting','generating','failed'].every(k=>Number.isSafeInteger(summary[k]) && summary[k]>=0)) throw new Error('invalid');
      if(isCurrent()) renderAdmin(data,summary);
    }).catch(()=>{if(isCurrent()) renderAdmin(data,null);});
    const rpcUpload=(dish,requestId,file)=>fetch(`${projectBase}/functions/v1/daily-menu-upload`,{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${adminToken}`,'content-type':file.type,'x-dish-id':String(dish),...(requestId ? {'x-request-id':String(requestId)} : {})},body:file,signal:AbortSignal.timeout(90000)});
    const onImageSaved=()=>{if(generation===adminGeneration) {announce('图片已更新');load();}};
    renderImageRequests({root:document.querySelector('#admin-image-requests'),rpc:adminRpc,rpcUpload,isCurrent,onSaved:onImageSaved,onApproved:()=>announce('已允许 AI 生成')});
    renderHistory({root:document.querySelector('#admin-history'),rpc:adminRpc,isCurrent,rpcUpload,onImageSaved});
    adminWorklist.replaceChildren(item('p','正在读取待处理事项…','hint'));
    try {
      const [response,managedResponse] = await Promise.all([adminRpc('menu_site_admin_worklist', {}),adminRpc('menu_site_admin_image_requests',{p_page:0})]);
      if (!response.ok) throw new Error('unavailable');
      const work = await response.json();
      let managed=[];
      if(managedResponse.ok) { const imageData=await managedResponse.json(); if(Array.isArray(imageData.managed_job_ids)) managed=imageData.managed_job_ids; }
      if (!isCurrent()) return;
      if (!Array.isArray(work.classification_review) || !Array.isArray(work.candidates) || !Number.isFinite(work.classification_review_count) || !Number.isFinite(work.candidate_count)) throw new Error('invalid');
      const managedSet=new Set(managed);
      const filteredStatus={...data,review:data.review.filter(j=>j.kind!=='image'||!managedSet.has(j.id)),jobs:data.jobs.map(j=>j.kind==='image'&&j.state==='needs_review'?{...j,count:Math.max(0,Number(j.count)-managedSet.size)}:j)};
      renderWorklist({data:work,status:filteredStatus,root:adminWorklist,rpc:adminRpc,isCurrent,refresh:loadAdmin,onSaved:(message,refreshMenu)=>{if(generation === adminGeneration) { announce(message); if(refreshMenu) load(); }}});
    } catch { if (isCurrent()) adminWorklist.replaceChildren(item('p','待处理事项暂时无法读取，请刷新后重试。','hint')); }
  } catch { if (isCurrent()) { adminBadge.textContent = '暂不可用'; adminResults.hidden = true; adminRefresh.hidden = false; adminMessage.textContent = '无法读取管理状态，请稍后重试。'; } }
  finally { if (isCurrent()) adminRefresh.disabled = false; }
}
function adminRpc(name, body) {
  return fetch(`${projectBase}/rest/v1/rpc/${name}`, {method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${adminToken}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
}
function lockAdmin(message = '登录后管理菜品、配图与历史记录。') {
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
document.querySelector('#usage-refresh').addEventListener('click',loadUsage);
adminLogout.addEventListener('click', () => lockAdmin());
settings.addEventListener('settingsleave', () => lockAdmin());
