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
    const [data, balances]=await Promise.all([
      adminRpc('menu_site_admin_usage',{}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch(`${projectBase}/functions/v1/daily-menu-balance`,{method:'POST',headers:{apikey:anonKey,authorization:`Bearer ${adminToken}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)}).then(r=>r.ok?r.json():null).catch(()=>null)
    ]);
    if(!current())return;
    const balanceText=(value)=>{
      if(!value) return '暂时无法读取';
      if(value.status==='unavailable') return '暂时无法读取';
      if(value.status==='not_configured') return '未接入';
      if(value.status!=='ok'||typeof value.available!=='string'||! /^-?\d+(?:\.\d+)?$/.test(value.available)||!['CNY','USD','JPY'].includes(value.currency)||!Number.isFinite(Number(value.available))) return '暂时无法读取';
      return new Intl.NumberFormat('zh-CN',{style:'currency',currency:value.currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value.available));
    };
    const billText=(value)=>{
      if(!value||value.status==='unavailable') return '暂时无法读取';
      if(value.status==='not_configured') return '未接入';
      if(value.status!=='ok') return '暂时无法读取';
      if(value.amount===null) return '暂无账单';
      return balanceText({status:'ok',available:value.amount,currency:value.currency});
    };
    const cards=item('div',null,'usage-balances');
    for (const [label,caption,value,bill] of [['阿里云','账户可用额度',balances?.ali,balances?.ali_bill],['火山引擎','账户可用余额',balances?.volc,balances?.volc_bill]]) {
      const card=item('div',null,'usage-balance');
      if(typeof bill?.current?.diagnostic==='string' && /^[A-Za-z0-9_.-]{1,100}$/.test(bill.current.diagnostic)) card.dataset.billStatus=bill.current.diagnostic;
      const amount=balanceText(value);
      card.append(item('span',label,'usage-provider'),item('span',caption,'usage-caption'),item('strong',amount,amount==='未接入'||amount==='暂时无法读取'?'usage-amount usage-unavailable':'usage-amount'));
      const billed=item('div',null,'usage-bill');
      billed.append(item('span','本月已出账'),item('strong',billText(bill?.current)));
      card.append(billed);
      cards.append(card);
    }
    const details=item('div',null,'usage-details');
    const row=(label,value)=>{const el=item('div',null,'usage-detail');el.append(item('span',label),item('strong',value));return el;};
    const tracking=typeof data?.ai_tracking_from==='string' && Number.isSafeInteger(data?.ai_requests_total) && Number.isSafeInteger(data?.ai_requests_today) && Number.isSafeInteger(data?.ai_requests_month);
    details.append(row('AI 请求尝试',tracking?`今日 ${data.ai_requests_today} · 本月 ${data.ai_requests_month} · 累计 ${data.ai_requests_total}`:'统计准备中'),
      row('上月已出账',`阿里云 ${billText(balances?.ali_bill?.previous)} · 火山 ${billText(balances?.volc_bill?.previous)}`),
      row('数据库进程启动',data?.database_process_started_at?formatTime(data.database_process_started_at):'暂时无法读取'));
    const scope=document.createElement('details');scope.className='usage-preferences usage-explanation';
    scope.append(item('summary','统计说明'),item('p',`阿里云：百炼业务空间账单；火山：账户内 AIDAP Supabase 账单。账单可能延迟。${tracking?` AI 请求统计自 ${formatTime(data.ai_tracking_from)} 开始。`:''}`,'usage-scope'));
    const alerts=item('div',null,'usage-alerts');
    const prefs=document.createElement('details');prefs.className='usage-preferences';
    prefs.append(item('summary','余额提醒'));
    const form=document.createElement('form');form.className='usage-preferences-form';
    let settings={};try{settings=JSON.parse(localStorage.getItem('daily-menu-balance-alerts-v1')||'{}')||{};}catch{}
    const inputs={};
    for(const [key,label] of [['ali','阿里云阈值（元）'],['volc','火山引擎阈值（元）']]) {
      const wrap=document.createElement('label');wrap.append(item('span',label));
      const input=document.createElement('input');input.type='number';input.min='0';input.step='0.01';input.placeholder='不提醒';input.value=typeof settings[key]==='number'&&Number.isFinite(settings[key])&&settings[key]>=0?String(settings[key]):'';inputs[key]=input;wrap.append(input);form.append(wrap);
    }
    const save=item('button','保存提醒','check-button');save.type='submit';form.append(save);
    const feedback=item('p','仅保存在当前设备。','usage-scope');form.append(feedback);prefs.append(form);
    function renderAlerts(){
      alerts.replaceChildren();
      for(const [key,label,value] of [['ali','阿里云',balances?.ali],['volc','火山引擎',balances?.volc]]) {
        const threshold=settings[key],amount=Number(value?.available);
        if(typeof threshold==='number'&&Number.isFinite(threshold)&&threshold>=0&&value?.status==='ok'&&value.currency==='CNY'&&Number.isFinite(amount)&&amount<threshold) alerts.append(item('p',`${label}余额低于提醒金额`,'usage-alert'));
      }
    }
    form.addEventListener('submit',event=>{event.preventDefault();const next={};for(const key of ['ali','volc']){if(inputs[key].value!==''){const n=Number(inputs[key].value);if(!Number.isFinite(n)||n<0)return;next[key]=n;}}try{localStorage.setItem('daily-menu-balance-alerts-v1',JSON.stringify(next));settings=next;feedback.textContent='已保存到当前设备。';renderAlerts();}catch{feedback.textContent='暂时无法保存，请检查浏览器设置。';}});
    renderAlerts();root.replaceChildren(alerts,cards,details,scope,prefs);
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
