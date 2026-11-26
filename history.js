// Render with textContent: dish names are untrusted input.
function renderHistory({root, rpc, isCurrent, rpcUpload, onImageSaved}) {
  let view = 'submissions', page = 0, search = '', sequence = 0;
  const make = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
  const category = value => ({meat:'荤菜',vegetable:'素菜',soup:'汤',unknown:'待确认'})[value] || '待确认';
  const imageStatus = dish => {
    const state = ({pending:'等待',running:'处理中',done:'已完成',needs_review:'需检查'})[dish.image_state];
    return `${dish.image ? '有图片' : '暂无图片'}${state ? ` · 图片任务${state}` : ''}`;
  };
  const tabs = make('div', null, 'work-actions');
  const submissions = make('button', '按提交记录', 'check-button'); submissions.type = 'button';
  const dishes = make('button', '按菜品汇总', 'check-button'); dishes.type = 'button';
  tabs.append(submissions, dishes);
  const form = make('form', null, 'history-search');
  const label = make('label', '搜索菜名或日期');
  const input = make('input'); input.type = 'search'; input.maxLength = 100;
  const submit = make('button', '搜索', 'check-button'); submit.type = 'submit';
  label.append(input); form.append(label, submit);
  const result = make('div'); result.setAttribute('aria-live','polite');
  const pagination = make('div', null, 'work-actions');
  const previous = make('button','上一页','check-button'); previous.type='button';
  const next = make('button','下一页','check-button'); next.type='button';
  const pageLabel = make('span'); pagination.append(previous,pageLabel,next);
  root.replaceChildren(tabs,form,result,pagination);

  async function refresh() {
    const current = ++sequence;
    submissions.setAttribute('aria-pressed',String(view === 'submissions'));
    dishes.setAttribute('aria-pressed',String(view === 'dishes'));
    label.firstChild.textContent = view === 'submissions' ? '搜索菜名或日期' : '搜索菜名';
    previous.disabled = next.disabled = true;
    result.replaceChildren(make('p','正在读取…','hint'));
    try {
      const response = await rpc('menu_site_admin_history',{p_view:view,p_search:search,p_page:page});
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (!isCurrent() || current !== sequence) return;
      if (!Array.isArray(data.items) || !Number.isFinite(data.total)) throw new Error('invalid');
      const rows = data.items.map(row => {
        const box = make('div',null,'work-item');
        if (view === 'submissions') {
          box.append(make('strong',row.date),make('p',`提交时间：${formatTime(row.created_at)}`,'work-hint'));
          for (const d of row.dishes || []) {
            const request=({waiting:'等待选择配图',generating:'AI 生成中',completed:'配图已处理',failed:'配图失败',superseded:'配图已被后续操作替代'})[d.request_state];
            box.append(make('p',`${d.name} · ${category(d.category)} · ${imageStatus(d)}${request ? ` · ${request}` : ''}`));
          }
        } else {
          box.append(make('strong',row.name),make('p',`${category(row.category)} · 出现 ${row.appearances} 次 · 最近菜单 ${row.last_date || '暂无'} · ${imageStatus(row)}`,'work-hint'));
          box.append(imageUploadControls({dish:row.id,requestId:null,rpcUpload,onSaved:onImageSaved}));
        }
        return box;
      });
      result.replaceChildren(...(rows.length ? rows : [make('p','没有找到记录。','hint')]));
      previous.disabled = page === 0; next.disabled = (page + 1) * 20 >= data.total;
      pageLabel.textContent = `第 ${page + 1} 页 · 共 ${data.total} 条`;
    } catch {
      if (isCurrent() && current === sequence) result.replaceChildren(make('p','历史记录暂时无法读取，请稍后重试。','hint'));
    }
  }
  submissions.addEventListener('click',()=>{view='submissions';page=0;refresh();});
  dishes.addEventListener('click',()=>{view='dishes';page=0;refresh();});
  form.addEventListener('submit',event=>{event.preventDefault();search=input.value.trim();page=0;refresh();});
  previous.addEventListener('click',()=>{if(page>0){page--;refresh();}});
  next.addEventListener('click',()=>{page++;refresh();});
  refresh();
}
