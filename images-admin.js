function imageUploadControls({dish, requestId, rpcUpload, onSaved}) {
  const box=document.createElement('div'); box.className='upload-controls';
  const label=document.createElement('label'); label.textContent='选择图片（JPEG、PNG 或 WebP，最多 10 MB）';
  const input=document.createElement('input'); input.type='file'; input.accept='image/jpeg,image/png,image/webp';
  const preview=document.createElement('img'); preview.className='upload-preview'; preview.alt='所选图片预览'; preview.hidden=true;
  const button=document.createElement('button'); button.type='button'; button.className='check-button'; button.textContent='上传图片'; button.disabled=true;
  const msg=document.createElement('p'); msg.className='work-hint'; msg.setAttribute('role','status');
  let previewUrl=null;
  label.append(input); box.append(label,preview,button,msg);
  input.addEventListener('change',()=>{
    if(previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=null; preview.hidden=true; button.disabled=true; msg.textContent='';
    const f=input.files?.[0]; if(!f)return;
    if(!['image/jpeg','image/png','image/webp'].includes(f.type) || !f.size || f.size>10*1024*1024){msg.textContent='请选择不超过 10 MB 的 JPEG、PNG 或 WebP 图片。';return;}
    previewUrl=URL.createObjectURL(f); preview.onload=()=>{button.disabled=false;};
    preview.onerror=()=>{button.disabled=true;preview.hidden=true;msg.textContent='无法打开这张图片，请选择其他文件。';};
    preview.src=previewUrl; preview.hidden=false;
  });
  button.addEventListener('click',async()=>{
    const f=input.files?.[0]; if(!f)return; button.disabled=true; input.disabled=true; msg.textContent='正在上传…';
    try { const response=await rpcUpload(dish,requestId,f); if(!response.ok) throw new Error();
      if(previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=null; msg.textContent='图片已更新。'; onSaved();
    } catch { msg.textContent='上传失败或记录已变化，请刷新后重试。'; button.disabled=false; input.disabled=false; }
  });
  return box;
}

function renderImageRequests({root,rpc,rpcUpload,isCurrent,onSaved,onApproved}) {
  let page=0, sequence=0, search='';
  const form=document.createElement('form'); form.className='history-search';
  const searchLabel=document.createElement('label'); searchLabel.textContent='搜索菜名或菜单日期';
  const input=document.createElement('input'); input.type='search';input.maxLength=100; searchLabel.append(input);
  const searchButton=document.createElement('button');searchButton.type='submit';searchButton.className='check-button';searchButton.textContent='搜索';form.append(searchLabel,searchButton);
  const result=document.createElement('div'); result.setAttribute('aria-live','polite');
  const controls=document.createElement('div'); controls.className='work-actions';
  const prev=document.createElement('button'), next=document.createElement('button'), label=document.createElement('span');
  for(const b of [prev,next]){b.type='button';b.className='check-button';} prev.textContent='上一页';next.textContent='下一页';controls.append(prev,label,next);root.replaceChildren(form,result,controls);
  const el=(tag,text,cls)=>{const node=document.createElement(tag);node.textContent=text;if(cls)node.className=cls;return node;};
  async function refresh(){
    const current=++sequence; prev.disabled=next.disabled=true; result.replaceChildren(el('p','正在读取配图等候区…','hint'));
    try {
      const response=await rpc('menu_site_admin_image_requests_search',{p_page:page,p_search:search}); if(!response.ok) throw new Error();
      const data=await response.json(); if(!isCurrent()||current!==sequence)return;
      if(!Array.isArray(data.items)||!Number.isFinite(data.total))throw new Error();
      if(page>0 && page*20>=data.total){page=Math.max(0,Math.ceil(data.total/20)-1);return refresh();}
      const rows=data.items.map(q=>{
        const row=el('div','','work-item'); row.append(el('strong',q.name),el('p',`${q.meal_date} · ${{waiting:'等待选择',generating:'AI 生成中',failed:'生成失败'}[q.state]||'等待处理'}`,'work-hint'));
        const actions=el('div','','work-actions'), msg=el('p','','work-hint');msg.setAttribute('role','status');
        if(q.state!=='generating'){
          const ai=el('button',q.state==='failed'?'重试 AI 生成':'允许 AI 生成','check-button');ai.type='button';
          ai.addEventListener('click',async()=>{if(!confirm(`允许为“${q.name}”生成图片？这可能产生费用。`))return;ai.disabled=true;msg.textContent='正在提交…';
            try{const r=await rpc('menu_site_admin_approve_image',{p_request:q.id});if(!r.ok||await r.json()!==true)throw new Error();onApproved();refresh();}
            catch{msg.textContent='暂时无法生成；该菜可能已有任务进行中，请稍后刷新重试。';ai.disabled=false;}}); actions.append(ai);
        }
        const upload=el('details','','upload-disclosure');upload.append(el('summary','上传图片'),imageUploadControls({dish:q.dish_id,requestId:q.id,rpcUpload,onSaved:()=>{onSaved();refresh();}}));actions.append(upload);row.append(actions,msg);return row;
      });
      result.replaceChildren(...(rows.length?rows:[el('p',search?'没有找到匹配的配图事项。':'目前没有等待处理的图片。','hint')]));
      prev.disabled=page===0;next.disabled=(page+1)*20>=data.total;label.textContent=`第 ${page+1} 页 · 共 ${data.total} 条`;
    } catch{if(isCurrent()&&current===sequence)result.replaceChildren(el('p','等候区暂时无法读取，请稍后重试。','hint'));}
  }
  form.addEventListener('submit',event=>{event.preventDefault();search=input.value.trim();page=0;refresh();});
  prev.addEventListener('click',()=>{if(page>0){page--;refresh();}});next.addEventListener('click',()=>{page++;refresh();});refresh();
}
