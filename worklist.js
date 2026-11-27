// The server checks the administrator for every read and write. All labels
// below use textContent because names and model explanations are untrusted.
function renderWorklist({data, status, root, rpc, isCurrent, refresh, onSaved}) {
  const el = (tag, text, cls) => { const node=document.createElement(tag); if(cls) node.className=cls; if(text != null) node.textContent=text; return node; };
  const reason = code => {
    const known={image_no_match:'未找到匹配的参考图',image_no_reference:'未找到参考图',image_timeout:'处理超时，结果不确定',image_search_timeout:'搜索参考图超时',image_vision_timeout:'识别参考图超时',image_generate_timeout:'图片生成超时，结果不确定',claim_expired:'处理超时，结果不确定',processing_failed:'处理失败'};
    const http=typeof code==='string' && code.match(/^image_(?:search|vision|generate|provider)_http_(\d{3})$/);
    if(http) return `图片服务请求失败（HTTP ${http[1]}），请检查服务状态或模型权限。`;
    return known[code] || '处理失败，请检查后决定';
  };
  function group(title,count,open) {
    const box=el('details',null,'work-group'); box.open=Boolean(open);
    const summary=el('summary',`${title} · ${count}`); box.append(summary); root.append(box); return box;
  }
  async function act(buttons, message, name, args, success, refreshMenu=false) {
    buttons.forEach(b=>b.disabled=true); message.textContent='正在保存…';
    try {
      const response=await rpc(name,args);
      if (!response.ok || await response.json() !== true) throw new Error('stale');
      if (isCurrent()) { await refresh(); onSaved(success,refreshMenu); }
    } catch { if (isCurrent()) {message.textContent='未能保存，项目可能已变化；请刷新后再试。';buttons.forEach(b=>b.disabled=false);} }
  }
  root.replaceChildren();
  const classes=group('待确认分类',data.classification_review_count,data.classification_review_count>0);
  if (!data.classification_review.length) classes.append(el('p','暂无待确认分类','work-hint'));
  for (const c of data.classification_review) {
    const row=el('div',null,'work-item');row.append(el('strong',c.name));
    if(c.is_soup) row.append(el('p','历史菜单中记录为汤','work-hint'));
    const controls=el('div',null,'work-actions'), msg=el('p','', 'work-hint');msg.setAttribute('role','status');
    const buttons=[];
    for(const [value,label] of (c.is_soup?[['soup','汤']]:[['meat','荤菜'],['vegetable','素菜'],['soup','汤']])) {
      const btn=el('button',label,'check-button');btn.type='button'; buttons.push(btn); controls.append(btn);
      btn.addEventListener('click',()=>{if(!confirm(`将“${c.name}”分类为${label}？`))return;act(buttons,msg,'menu_site_admin_set_classification',{p_dish:c.id,p_category:value,p_seen_at:c.updated_at},'分类已保存。',true);});
    }
    row.append(controls,msg);classes.append(row);
  }
  if(data.classification_review_count>data.classification_review.length) classes.append(el('p','仅显示前 100 项，处理后刷新查看更多。','work-hint'));
  const images=status.review.filter(j=>j.kind==='image');
  const imageCount=status.jobs.filter(j=>j.kind==='image'&&j.state==='needs_review').reduce((n,j)=>n+Number(j.count),0);
  const imageGroup=group('失败图片',imageCount,imageCount>0);
  if(!images.length) imageGroup.append(el('p','暂无失败图片','work-hint'));
  if(images.length) {
    const bulk=el('button','一键重试失败图片','check-button bulk-retry'); bulk.type='button';
    const progress=el('p','', 'work-hint'); progress.setAttribute('role','status');
    imageGroup.append(bulk,progress);
    bulk.addEventListener('click',async()=>{
      if(!confirm(`将当前 ${imageCount} 个失败图片任务重新排队？有原结果的任务会重新转存，其余会重新生成，可能再次产生费用；生成成功后会替换现有图片。`)) return;
      const controls=[...root.querySelectorAll('button')]; controls.forEach(button=>button.disabled=true);
      const attempted=new Set(); let succeeded=0, failed=0, current=status, stopped=false;
      const cutoff=Date.parse(status.checked_at);
      try {
        while(isCurrent() && attempted.size<imageCount) {
          const batch=current.review.filter(job=>job.kind==='image' && !attempted.has(job.id) && (!Number.isFinite(cutoff) || Date.parse(job.updated_at)<=cutoff));
          if(!batch.length) break;
          for(const job of batch) {
            if(!isCurrent() || attempted.size>=imageCount) break;
            attempted.add(job.id); progress.textContent=`正在处理 ${attempted.size} / ${imageCount}…`;
            try {
              const response=await rpc('menu_site_admin_retry_image',{p_job:job.id,p_seen_at:job.updated_at,p_allow_new:!job.transfer_available});
              if([401,403].includes(response.status)) { failed++; stopped=true; break; }
              if(!response.ok || await response.json() !== true) failed++; else succeeded++;
            } catch { failed++; }
          }
          if(!isCurrent() || stopped || attempted.size>=imageCount) break;
          const response=await rpc('menu_site_admin_status',{});
          if(!response.ok) { stopped=true; break; }
          current=await response.json();
          if(!Array.isArray(current.review)) { stopped=true; break; }
        }
      } catch { stopped=true; }
      if(!isCurrent()) return;
      const remaining=Math.max(0,imageCount-attempted.size);
      const result=`已重新排队 ${succeeded} 项${failed?`，${failed} 项未确认成功`:''}${remaining?`，${remaining} 项未处理`:''}。${failed||remaining||stopped?'请刷新后检查剩余任务。':''}`;
      await refresh();
      const resultLine=el('p',result,'bulk-result'); resultLine.setAttribute('role','status'); root.prepend(resultLine);
      onSaved(result,false);
    });
  }
  for (const job of images) {
    const row=el('div',null,'work-item');row.append(el('strong',job.name),el('p',reason(job.error),'work-hint'));
    const btn=el('button',job.transfer_available?'重新排队转存':'重新排队生成','check-button'); btn.type='button';
    const msg=el('p','', 'work-hint');msg.setAttribute('role','status');
    btn.addEventListener('click',()=>{
      const prompt=job.transfer_available?`将“${job.name}”的已有结果重新排队转存？`:`为“${job.name}”重新排队生成图片？可能再次产生模型费用，成功后会替换现有图片；之前超时的请求可能已经计费。`;
      if(!confirm(prompt))return;
      act([btn],msg,'menu_site_admin_retry_image',{p_job:job.id,p_seen_at:job.updated_at,p_allow_new:!job.transfer_available},'任务已重新排队，执行时间取决于派发设置。');
    });
    row.append(btn,msg);imageGroup.append(row);
  }
  if(imageCount>images.length) imageGroup.append(el('p','仅显示最近 50 条','work-hint'));
  const other=status.review.filter(j=>j.kind!=='image');
  if(other.length) {
    const groupOther=group('其他待检查任务',other.length,true);
    for(const job of other) groupOther.append(el('p',`${job.name} · ${job.kind==='dedupe'?'查重':'其他任务'} · 需要检查`, 'work-hint'));
    groupOther.append(el('p','这类任务暂不能在网页重试。','work-hint'));
  }
  const matches=group('相似菜待确认',data.candidate_count,data.candidate_count>0);
  if(!data.candidates.length) matches.append(el('p','暂无相似菜','work-hint'));
  for (const c of data.candidates) {
    const row=el('div',null,'work-item');row.append(el('strong',`${c.dish} / ${c.candidate}`),el('p',c.reason,'work-hint'));
    const yes=el('button','同一道菜','check-button');yes.type='button';
    const no=el('button','不是同一道菜','check-button');no.type='button';
    const msg=el('p','', 'work-hint');msg.setAttribute('role','status');
    yes.addEventListener('click',()=>{if(!confirm(`确认“${c.dish}”和“${c.candidate}”是同一道菜？确认后会将两个名称关联。`))return;act([yes,no],msg,'menu_site_admin_decide_candidate',{p_dish:c.dish_id,p_candidate:c.candidate_id,p_accept:true},'已关联为同一道菜。',true);});
    no.addEventListener('click',()=>{if(!confirm(`确认“${c.dish}”和“${c.candidate}”不是同一道菜？`))return;act([yes,no],msg,'menu_site_admin_reject_candidate',{p_dish:c.dish_id,p_candidate:c.candidate_id},'已记录为不同菜。');});
    row.append(yes,no,msg);matches.append(row);
  }
  if(data.candidate_count>data.candidates.length) matches.append(el('p','仅显示前 100 项，处理后刷新查看更多。','work-hint'));
}
