function isPendDetailVisible(){
  const el=document.querySelector('.pend-detail-toolbar');
  if(!el)return false;
  const r=el.getBoundingClientRect();
  return r.top>=56&&r.top<window.innerHeight*0.55;
}

function focusPendDetail(options={}){
  const toolbar=document.querySelector('.pend-detail-toolbar');
  if(!toolbar)return;
  toolbar.classList.remove('pend-detail-focus');
  void toolbar.offsetWidth;
  toolbar.classList.add('pend-detail-focus');
  if(options.forceScroll||(!options.skipScroll&&!isPendDetailVisible())){
    toolbar.scrollIntoView({behavior:'smooth',block:'start'});
  }
}

function syncPendChipStates(){
  document.querySelectorAll('#pendMode button').forEach(x=>x.classList.toggle('active',x.dataset.mode===pendMode));
  document.querySelectorAll('.pend-actor-chip[data-pend-mode]').forEach(chip=>{
    chip.classList.toggle('active',pendMode===chip.dataset.pendMode&&pendActor===chip.dataset.pendActor);
  });
}

function updatePendDetailMeta(){
  const items=pendItemsForMode();
  document.getElementById('pendJumpCount').textContent=items.length;
  const titles={
    debo:'Yo debo responder — especialidad × contraparte',
    me_deben:'Me deben respuesta — especialidad × contraparte',
    respondidos:'Respondidos / cerrados — ya no pendientes',
    comunicacion:'Traslados / comunicación — especialidad × contraparte'
  };
  document.getElementById('pendMatrixTitle').textContent=titles[pendMode]||titles.debo;
  document.getElementById('pendMatrixSub').textContent=pendMode==='respondidos'
    ?'Historial de cartas cerradas que antes eran Yo debo o Me deben (últimos 120 registros visibles)'
    :(pendActor==='all'
      ?'Clic en un número para filtrar Cartas por esa especialidad y contraparte'
      :`Filtrado a contraparte: ${ACTOR_LABELS[pendActor]||pendActor}`);
  const hilosBlock=document.getElementById('pendHilosBlock');
  const operBlock=document.getElementById('pendOperBlock');
  const matrixCard=document.getElementById('pendMatrixBlock');
  if(hilosBlock)hilosBlock.style.display=(pendMode==='comunicacion'||pendMode==='respondidos')?'none':'';
  if(operBlock)operBlock.style.display='';
  if(matrixCard)matrixCard.style.display=pendMode==='respondidos'?'none':'';
  return items;
}

function renderPendMatrix(){
  const items=pendItemsForMode();
  const matrixCard=document.getElementById('pendMatrixBlock');
  if(pendMode==='respondidos'||pendMode==='comunicacion'){
    matrixCard?.classList.remove('is-updating');
    return;
  }
  matrixCard?.classList.add('is-updating');
  const espSet=new Set();
  const matrix={};
  PEND_MATRIX_IDS={};
  items.forEach(c=>{
    const esp=pendEspKey(c);
    const act=pendContraparteKey(c);
    espSet.add(esp);
    matrix[esp]=matrix[esp]||{};
    matrix[esp][act]=(matrix[esp][act]||0)+1;
    PEND_MATRIX_IDS[esp]=PEND_MATRIX_IDS[esp]||{};
    PEND_MATRIX_IDS[esp][act]=PEND_MATRIX_IDS[esp][act]||[];
    PEND_MATRIX_IDS[esp][act].push(c.id);
  });
  const esps=[...espSet].sort((a,b)=>{
    const ta=PEND_CONTRAPARTES.reduce((s,k)=>s+((matrix[a]||{})[k]||0),0);
    const tb=PEND_CONTRAPARTES.reduce((s,k)=>s+((matrix[b]||{})[k]||0),0);
    return tb-ta||a.localeCompare(b);
  });
  const thead=document.querySelector('#pendMatrix thead');
  const tbody=document.querySelector('#pendMatrix tbody');
  thead.innerHTML='<tr><th>Especialidad</th>'+PEND_CONTRAPARTES.map(a=>`<th>${ACTOR_LABELS[a]}</th>`).join('')+'<th>Total</th></tr>';
  tbody.innerHTML='';
  if(!esps.length){
    tbody.innerHTML=`<tr><td colspan="${PEND_CONTRAPARTES.length+2}" style="color:var(--text-muted);padding:16px">Sin cartas en este modo</td></tr>`;
  }else{
    esps.forEach((esp,idx)=>{
      const tr=document.createElement('tr');
      tr.className='row-rendered';
      tr.style.animationDelay=`${Math.min(idx*12,180)}ms`;
      let total=0;
      const cells=PEND_CONTRAPARTES.map(act=>{
        const n=(matrix[esp]||{})[act]||0;
        total+=n;
        if(!n)return '<td class="num" style="color:var(--text-muted);cursor:default">0</td>';
        return `<td class="num" data-esp="${escapeHtml(esp)}" data-act="${act}" title="Ver ${n} carta${n===1?'':'s'} en Cartas">${n}</td>`;
      }).join('');
      tr.innerHTML=`<td>${escapeHtml(esp)}</td>${cells}<td class="num" data-esp="${escapeHtml(esp)}" data-act="all"><strong>${total}</strong></td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('td.num[data-esp]').forEach(td=>{
      td.addEventListener('click',()=>{
        const esp=td.dataset.esp;
        const act=td.dataset.act;
        const actor=act==='all'?'all':act;
        if(actor!=='all')pendActor=actor;
        else pendActor='all';
        syncPendChipStates();
        const ids=pendMatrixIdsFor(esp,act);
        applyPendienteToFilters(pendMode,actor,esp,{ids});
      });
    });
  }
  requestAnimationFrame(()=>matrixCard?.classList.remove('is-updating'));
}

function setPendOperPage(page){
  pendOperPage=page;
  renderPendOperTable();
}

function updatePendOperPagination(start,shown,total){
  const bar=document.getElementById('pendOperPaginationBar');
  const info=document.getElementById('pendOperPaginationInfo');
  const ctrl=document.getElementById('pendOperPaginationControls');
  if(!bar||!info||!ctrl)return;
  if(pendMode==='comunicacion'){
    bar.style.display='none';
    return;
  }
  bar.style.display='flex';
  if(!total){
    info.innerHTML='<span style="color:var(--text-muted)">Sin resultados</span>';
    ctrl.innerHTML='';
    return;
  }
  const pages=Math.max(1,Math.ceil(total/PEND_OPER_PAGE_SIZE));
  const startItem=start+1;
  const endItem=Math.min(start+shown,total);
  info.innerHTML=`
    <span style="font-weight:500">Mostrando <strong style="color:var(--text-primary);font-weight:700">${startItem}–${endItem}</strong> de <strong style="color:var(--text-primary);font-weight:700">${total}</strong> cartas</span>
    <span class="badge-soft" style="font-size:11px;padding:3px 8px;font-weight:700;color:var(--text-secondary);background:#ECE8E1;border:1px solid #DFD9CE;border-radius:5px">
      Página ${pendOperPage} de ${pages}
    </span>`;
  ctrl.innerHTML='';
  const mkBtn=(html,page,disabled=false,active=false,title='')=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='btn-page'+(active?' active':'');
    b.innerHTML=html;
    b.disabled=disabled;
    if(title)b.title=title;
    b.onclick=()=>setPendOperPage(page);
    ctrl.appendChild(b);
  };
  const mkEllipsis=()=>{
    const span=document.createElement('span');
    span.className='btn-page-ellipsis';
    span.textContent='…';
    ctrl.appendChild(span);
  };

  // 1. Primera página (⏮)
  mkBtn('<i class="ri-skip-back-mini-line"></i>',1,pendOperPage<=1,false,'Primera página (Pág. 1)');
  // 2. Página anterior (◀)
  mkBtn('<i class="ri-arrow-left-s-line"></i>',pendOperPage-1,pendOperPage<=1,false,'Página anterior');

  // 3. Botones numéricos inteligentes con elipsis
  if(pages<=7){
    for(let p=1;p<=pages;p++){
      mkBtn(String(p),p,false,p===pendOperPage,`Página ${p}`);
    }
  } else {
    mkBtn('1',1,false,pendOperPage===1,'Página 1');
    let from=Math.max(2,pendOperPage-1);
    let to=Math.min(pages-1,pendOperPage+1);
    if(pendOperPage<=3){
      from=2;to=4;
    } else if(pendOperPage>=pages-2){
      from=pages-3;to=pages-1;
    }
    if(from>2)mkEllipsis();
    for(let p=from;p<=to;p++){
      mkBtn(String(p),p,false,p===pendOperPage,`Página ${p}`);
    }
    if(to<pages-1)mkEllipsis();
    mkBtn(String(pages),pages,false,pendOperPage===pages,`Página ${pages}`);
  }

  // 4. Página siguiente (▶)
  mkBtn('<i class="ri-arrow-right-s-line"></i>',pendOperPage+1,pendOperPage>=pages,false,'Página siguiente');
  // 5. Última página (⏭)
  mkBtn('<i class="ri-skip-forward-mini-line"></i>',pages,pendOperPage>=pages,false,`Última página (Pág. ${pages})`);

  // 6. Desplegable rápido ("Ir a página...")
  if(pages>1){
    const jumpWrap=document.createElement('div');
    jumpWrap.className='pagination-jump-wrap';
    const jumpLabel=document.createElement('label');
    jumpLabel.htmlFor='pendOperPageJump';
    jumpLabel.className='pagination-jump-label';
    jumpLabel.textContent='Ir a:';
    const jumpSelect=document.createElement('select');
    jumpSelect.id='pendOperPageJump';
    jumpSelect.className='pagination-select';
    jumpSelect.setAttribute('aria-label','Seleccionar página directa');
    for(let p=1;p<=pages;p++){
      const opt=document.createElement('option');
      opt.value=p;
      const pStart=(p-1)*PEND_OPER_PAGE_SIZE+1;
      const pEnd=Math.min(p*PEND_OPER_PAGE_SIZE,total);
      opt.textContent=`Pág. ${p} (${pStart}–${pEnd})`;
      if(p===pendOperPage)opt.selected=true;
      jumpSelect.appendChild(opt);
    }
    jumpSelect.onchange=(e)=>{
      const targetPage=parseInt(e.target.value,10);
      if(!isNaN(targetPage)&&targetPage>=1&&targetPage<=pages){
        setPendOperPage(targetPage);
      }
    };
    jumpWrap.appendChild(jumpLabel);
    jumpWrap.appendChild(jumpSelect);
    ctrl.appendChild(jumpWrap);
  }
}

function renderPendOperTable(){
  const tbody=document.getElementById('pendOperBody');
  const thead=document.getElementById('pendOperHead');
  const title=document.getElementById('pendOperTitle');
  const sub=document.getElementById('pendOperSub');
  const pBar=document.getElementById('pendOperPaginationBar');
  if(!tbody||!thead)return;
  if(pendMode==='comunicacion'){
    tbody.innerHTML='';
    if(pBar)pBar.style.display='none';
    return;
  }
  if(pendMode==='respondidos'){
    const allItems=pendItemsForMode();
    if(title)title.textContent='Respondidos — ya no están en pendientes';
    if(sub)sub.textContent='Cartas cerradas (CERRADO / ABSUELTO) que fueron Yo debo o Me deben. Ordenadas por fecha de documento.';
    thead.innerHTML='<tr><th>N° carta</th><th>Tipo doc.</th><th>Especialidad</th><th>Modo</th><th>Contraparte</th><th>Fecha doc.</th><th>Estado cierre</th><th>Especialista / área</th><th>Asunto</th><th class="col-acc" style="text-align:right">Acciones</th></tr>';
    tbody.innerHTML='';
    const total=allItems.length;
    const totalPages=Math.max(1,Math.ceil(total/PEND_OPER_PAGE_SIZE));
    if(pendOperPage>totalPages)pendOperPage=totalPages;
    if(pendOperPage<1)pendOperPage=1;
    const start=(pendOperPage-1)*PEND_OPER_PAGE_SIZE;
    const items=allItems.slice(start,start+PEND_OPER_PAGE_SIZE);
    if(!total){
      tbody.innerHTML='<tr><td colspan="10" style="color:var(--text-muted);padding:16px">Sin cartas respondidas/cerradas en este filtro</td></tr>';
      updatePendOperPagination(0,0,0);
      return;
    }
    items.forEach((c,idx)=>{
      const cl=classif(c);
      const eraDebo=cartaEraPendienteDebo(c);
      const tr=document.createElement('tr');
      tr.className='row-rendered';
      tr.style.animationDelay=`${Math.min(idx*10,160)}ms`;
      const asunto=String(c.asunto||'').slice(0,120)+(String(c.asunto||'').length>120?'…':'');
      const cp=inferContraparteHistorica(c);
      tr.innerHTML=`
        <td class="cell-doc">${escapeHtml(c.n_documento||'—')}</td>
        <td style="font-weight:600;color:var(--text-secondary)">${escapeHtml(getTipoDocumentoDisplay(c))}</td>
        <td>${escapeHtml(getEspecialidadDisplay(c))}</td>
        <td>${eraDebo?'Yo debía':'Me debían'}</td>
        <td>${escapeHtml(ACTOR_LABELS[cp]||cp||'—')}</td>
        <td style="white-space:nowrap">${fmtDate(c.fecha)||'—'}</td>
        <td><span class="status-badge ${estadoBadgeClass(c.estado_norm)}">${escapeHtml(c.estado_norm||c.estado||'—')}</span></td>
        <td>${escapeHtml(eraDebo?yoDeboResponderLabel(c):(cl.contraparte_label||'—'))}</td>
        <td class="cell-asunto" title="${escapeHtml(c.asunto||'')}">${escapeHtml(asunto||'—')}</td>
        <td class="col-acc">
          <div class="actions-group">
            <button type="button" class="btn-act btn-act-edit" title="Ver detalle de la carta" onclick="openEditModal(${c.id})"><i class="ri-eye-line"></i></button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
    updatePendOperPagination(start,items.length,total);
    return;
  }
  const allItems=pendItemsForMode().map(c=>{
    const plazo=plazoRespuestaOperativo(c,pendMode);
    return{c,plazo,cl:classif(c)};
  });
  allItems.sort((a,b)=>{
    const av=(a.plazo.dias_atraso||0);
    const bv=(b.plazo.dias_atraso||0);
    if(bv!==av)return bv-av;
    return String(a.c.fecha||'').localeCompare(String(b.c.fecha||''));
  });
  if(title){
    title.textContent=pendMode==='me_deben'
      ?'Listado operativo — Me deben respuesta'
      :'Listado operativo — Yo debo responder';
  }
  if(sub){
    sub.textContent=pendMode==='me_deben'
      ?'Cartas emitidas por RO/RL: tipo de documento, especialidad, fecha de envío, destinatario, plazo contractual y atraso.'
      :'Cartas recibidas: tipo de documento, especialidad, contraparte emisora, especialista interno asignado (área), plazo contractual y atraso.';
  }
  if(pendMode==='me_deben'){
    thead.innerHTML='<tr><th>N° carta</th><th>Tipo doc.</th><th>Especialidad</th><th>Emitida por</th><th>Fecha envío</th><th>Enviada a</th><th>Debe responder</th><th>Asunto</th><th>Fecha límite</th><th>Plazo</th><th>Estado</th><th class="col-acc" style="text-align:right">Acciones</th></tr>';
  }else{
    thead.innerHTML='<tr><th>N° carta</th><th>Tipo doc.</th><th>Especialidad</th><th>Recibida de</th><th>Fecha</th><th>Flujo</th><th>Especialista / área</th><th>Asunto</th><th>Fecha límite</th><th>Plazo</th><th>Estado</th><th class="col-acc" style="text-align:right">Acciones</th></tr>';
  }
  tbody.innerHTML='';
  const total=allItems.length;
  const totalPages=Math.max(1,Math.ceil(total/PEND_OPER_PAGE_SIZE));
  if(pendOperPage>totalPages)pendOperPage=totalPages;
  if(pendOperPage<1)pendOperPage=1;
  const start=(pendOperPage-1)*PEND_OPER_PAGE_SIZE;
  const items=allItems.slice(start,start+PEND_OPER_PAGE_SIZE);
  if(!total){
    tbody.innerHTML='<tr><td colspan="12" style="color:var(--text-muted);padding:16px">Sin cartas en este modo'+(pendActor!=='all'?' y contraparte':'')+'</td></tr>';
    updatePendOperPagination(0,0,0);
    return;
  }
  items.forEach((row,idx)=>{
    const{c,plazo,cl}=row;
    const act=getCartaActionInfo(c);
    const tr=document.createElement('tr');
    tr.className='row-rendered';
    tr.style.animationDelay=`${Math.min(idx*10,160)}ms`;
    const limiteFmt=plazo.fecha_limite?fmtDate(plazo.fecha_limite):'—';
    const asunto=String(c.asunto||'').slice(0,120)+(String(c.asunto||'').length>120?'…':'');
    
    let actionBtnHtml='';
    if(CURRENT_USER&&CURRENT_USER.can_create_cartas&&act.canAction){
      actionBtnHtml=`<button type="button" class="btn-act ${act.btnClass}" title="${escapeHtml(act.title)}" onclick="openResponderModal(${c.id})"><i class="${act.icon}"></i></button>`;
    }

    if(pendMode==='me_deben'){
      tr.innerHTML=`
        <td class="cell-doc">${escapeHtml(c.n_documento||'—')}</td>
        <td style="font-weight:600;color:var(--text-secondary)">${escapeHtml(getTipoDocumentoDisplay(c))}</td>
        <td>${escapeHtml(getEspecialidadDisplay(c))}</td>
        <td>${escapeHtml(emitidorCartaLabel(c))}</td>
        <td style="white-space:nowrap">${fmtDate(c.fecha)||'—'}</td>
        <td>${escapeHtml(cl.contraparte_label||ACTOR_LABELS[cl.contraparte]||'—')}</td>
        <td>${escapeHtml(cl.contraparte_label||'—')}<br><span style="font-size:10px;color:var(--text-muted)">${escapeHtml(plazo.regla_label||'')}</span></td>
        <td class="cell-asunto" title="${escapeHtml(c.asunto||'')}">${escapeHtml(asunto||'—')}</td>
        <td style="white-space:nowrap">${limiteFmt}</td>
        <td>${pendPlazoBadgeHtml(plazo)}</td>
        <td><span class="status-badge ${estadoBadgeClass(c.estado_norm)}">${escapeHtml(c.estado_norm||c.estado||'—')}</span></td>
        <td class="col-acc">
          <div class="actions-group">
            ${actionBtnHtml}
            <button type="button" class="btn-act btn-act-edit" title="Ver detalle de la carta" onclick="openEditModal(${c.id})"><i class="ri-eye-line"></i></button>
          </div>
        </td>`;
    }else{
      const respLabel=yoDeboResponderLabel(c);
      tr.innerHTML=`
        <td class="cell-doc">${escapeHtml(c.n_documento||'—')}</td>
        <td style="font-weight:600;color:var(--text-secondary)">${escapeHtml(getTipoDocumentoDisplay(c))}</td>
        <td>${escapeHtml(getEspecialidadDisplay(c))}</td>
        <td>${escapeHtml(cl.contraparte_label||'—')}</td>
        <td style="white-space:nowrap">${fmtDate(c.fecha)||'—'}</td>
        <td>${flujoBadge(c)}</td>
        <td>${escapeHtml(respLabel)}${respLabel==='Sin asignar'?'<br><span style="font-size:10px;color:var(--rose)">Asigne área en la carta</span>':''}<br><span style="font-size:10px;color:var(--text-muted)">${escapeHtml(plazo.regla_label||'')}</span></td>
        <td class="cell-asunto" title="${escapeHtml(c.asunto||'')}">${escapeHtml(asunto||'—')}</td>
        <td style="white-space:nowrap">${limiteFmt}</td>
        <td>${pendPlazoBadgeHtml(plazo)}</td>
        <td><span class="status-badge ${estadoBadgeClass(c.estado_norm)}">${escapeHtml(c.estado_norm||c.estado||'—')}</span></td>
        <td class="col-acc">
          <div class="actions-group">
            ${actionBtnHtml}
            <button type="button" class="btn-act btn-act-edit" title="Ver detalle de la carta" onclick="openEditModal(${c.id})"><i class="ri-eye-line"></i></button>
          </div>
        </td>`;
    }
    tbody.appendChild(tr);
  });
  updatePendOperPagination(start,items.length,total);
}

async function refreshHilosAsync(){
  if(pendMode==='comunicacion'){
    HILOS={hilos:[],counts:{},plazo_dias:5};
    renderHilos();
    return;
  }
  const block=document.getElementById('pendHilosBlock');
  if(!block)return;
  const token=++hilosLoadToken;
  block.classList.add('is-loading');
  try{
    await loadHilos();
    if(token===hilosLoadToken)renderHilos();
  }catch(e){
    console.warn('hilos',e);
    if(token===hilosLoadToken)renderHilos();
  }finally{
    if(token===hilosLoadToken)block.classList.remove('is-loading');
  }
}

function applyPendSelection(mode,actor,options={}){
  pendMode=mode;
  pendActor=actor;
  if(!options.preservePage)pendOperPage=1;
  if(options.resetHiloExpand!==false)hiloExpanded=null;
  syncPendChipStates();
  updatePendDetailMeta();
  renderPendMatrix();
  renderPendOperTable();
  refreshHilosAsync();
  if(options.focus)focusPendDetail({skipScroll:options.skipScroll,forceScroll:options.forceScroll});
}

function renderActorChips(containerId, byActor, mode){
  const el=document.getElementById(containerId);
  el.innerHTML='';
  PEND_CONTRAPARTES.forEach(id=>{
    const n=(byActor&&byActor[id])||0;
    const b=document.createElement('button');
    b.type='button';
    b.dataset.pendMode=mode;
    b.dataset.pendActor=id;
    b.className='pend-actor-chip'+(pendMode===mode&&pendActor===id?' active':'');
    b.innerHTML=`<span class="n">${n}</span><span class="l">${ACTOR_LABELS[id]||id}</span>`;
    b.addEventListener('click',()=>{
      const nextActor=(pendMode===mode&&pendActor===id)?'all':id;
      applyPendSelection(mode,nextActor,{focus:true,skipScroll:true});
    });
    el.appendChild(b);
  });
}

function pendItemsForMode(){
  if(pendMode==='respondidos'){
    return ALL_CARTAS.filter(c=>{
      const est=(c.estado_norm||c.estado||'').toUpperCase();
      if(!CLOSED_PEND_STATES.has(est))return false;
      const eraDebo=cartaEraPendienteDebo(c);
      const eraMe=cartaEraPendienteMeDeben(c);
      if(!eraDebo&&!eraMe)return false;
      if(pendActor!=='all'){
        const cp=inferContraparteHistorica(c);
        if(cp!==pendActor)return false;
      }
      return true;
    }).sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
  }
  return ALL_CARTAS.filter(c=>{
    const cl=classif(c);
    if(pendMode==='comunicacion')return cl.naturaleza==='comunicacion'||cl.solo_comunicacion;
    if(pendMode==='debo'){
      if(cl.deuda!=='debo')return false;
      return isPendContraparte(cl);
    }
    if(pendMode==='me_deben'){
      if(cl.deuda!=='me_deben')return false;
      return isPendContraparte(cl);
    }
    return false;
  }).filter(c=>{
    if(pendActor==='all')return true;
    return classif(c).contraparte===pendActor;
  });
}

function renderPendientesSkeleton(){
  const deboCount=document.getElementById('pendDeboCount');
  if(deboCount)deboCount.innerHTML='<div class="skeleton" style="width:65px;height:36px;margin-bottom:8px"></div>';
  const meDebenCount=document.getElementById('pendMeDebenCount');
  if(meDebenCount)meDebenCount.innerHTML='<div class="skeleton" style="width:65px;height:36px;margin-bottom:8px"></div>';
  
  const deboActors=document.getElementById('pendDeboActors');
  if(deboActors){
    deboActors.innerHTML=`
      <div class="pend-actor-chip" style="pointer-events:none"><div class="skeleton skeleton-text" style="width:24px;height:16px;margin-bottom:4px"></div><div class="skeleton skeleton-text" style="width:55px;height:10px"></div></div>
      <div class="pend-actor-chip" style="pointer-events:none"><div class="skeleton skeleton-text" style="width:24px;height:16px;margin-bottom:4px"></div><div class="skeleton skeleton-text" style="width:48px;height:10px"></div></div>
      <div class="pend-actor-chip" style="pointer-events:none"><div class="skeleton skeleton-text" style="width:24px;height:16px;margin-bottom:4px"></div><div class="skeleton skeleton-text" style="width:60px;height:10px"></div></div>`;
  }
  const meDebenActors=document.getElementById('pendMeDebenActors');
  if(meDebenActors){
    meDebenActors.innerHTML=`
      <div class="pend-actor-chip" style="pointer-events:none"><div class="skeleton skeleton-text" style="width:24px;height:16px;margin-bottom:4px"></div><div class="skeleton skeleton-text" style="width:55px;height:10px"></div></div>
      <div class="pend-actor-chip" style="pointer-events:none"><div class="skeleton skeleton-text" style="width:24px;height:16px;margin-bottom:4px"></div><div class="skeleton skeleton-text" style="width:48px;height:10px"></div></div>
      <div class="pend-actor-chip" style="pointer-events:none"><div class="skeleton skeleton-text" style="width:24px;height:16px;margin-bottom:4px"></div><div class="skeleton skeleton-text" style="width:60px;height:10px"></div></div>`;
  }

  const pmb=document.querySelector('#pendMatrix tbody');
  if(pmb){
    let html='';
    for(let i=0;i<5;i++){
      const wEsp=100+(i%3)*20;
      html+=`
        <tr class="skeleton-row">
          <td><div class="skeleton skeleton-text" style="width:${wEsp}px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:24px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:24px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:24px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:24px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:24px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:24px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:30px"></div></td>
        </tr>`;
    }
    pmb.innerHTML=html;
  }

  const htb=document.querySelector('#hilosTable tbody');
  if(htb){
    let hhtml='';
    for(let i=0;i<5;i++){
      hhtml+=`
        <tr class="skeleton-row">
          <td><div class="skeleton skeleton-pill" style="width:75px"></div></td>
          <td><div class="skeleton skeleton-text" style="width:130px"></div></td>
          <td><div class="skeleton skeleton-pill" style="width:85px"></div></td>
          <td><div class="skeleton skeleton-text" style="width:40px"></div></td>
          <td><div class="skeleton skeleton-text" style="width:90px"></div></td>
          <td><div class="skeleton skeleton-text" style="width:30px"></div></td>
          <td><div class="skeleton skeleton-text" style="width:30px"></div></td>
          <td><div class="skeleton skeleton-text" style="width:75px"></div></td>
        </tr>`;
    }
    htb.innerHTML=hhtml;
  }
}

function renderPendientes(){
  const p=PENDIENTES||{};
  const counts=p.counts||{debo:0,me_deben:0,comunicacion:0};
  document.getElementById('pendDeboCount').textContent=counts.debo||0;
  document.getElementById('pendMeDebenCount').textContent=counts.me_deben||0;
  renderActorChips('pendDeboActors',(p.debo&&p.debo.by_actor)||{},'debo');
  renderActorChips('pendMeDebenActors',(p.me_deben&&p.me_deben.by_actor)||{},'me_deben');
  syncPendChipStates();
  updatePendDetailMeta();
  renderPendMatrix();
  renderPendOperTable();
  renderHilos();
}

function semaforoHtml(sem){
  const tone=(sem&&sem.tone)||'muted';
  const label=(sem&&sem.label)||'—';
  return `<span class="hilo-sem ${tone}"><span class="hilo-dot"></span>${escapeHtml(label)}</span>`;
}

function renderHilos(){
  const h=HILOS||{};
  const counts=h.counts||{};
  const plazo=h.plazo_dias||5;
  const legadoD=h.legado_dias||60;
  document.getElementById('hilosSub').textContent=
    `Ancla = última carta abierta con deuda · plazo ${plazo}d (1–${h.verde_hasta||3} verde, ${h.amarillo_dia||4} ámbar, ≥${plazo} rojo) · legado >${legadoD}d desde ancla. Foco: ${hiloFoco}.`;
  const countsEl=document.getElementById('hilosCounts');
  const chips=[
    ['En vista', (h.hilos||[]).length],
    ['Operativos',counts.operativos||0],
    ['Urgentes',counts.urgentes||0],
    ['A tiempo',counts.a_tiempo||0],
    ['Por vencer',counts.por_vencer||0],
    ['Vencidos',counts.vencido||0],
    ['Legado',counts.legado||0]
  ];
  countsEl.innerHTML=chips.map(([l,n])=>`<div class="pend-actor-chip" style="cursor:default"><span class="n">${n}</span><span class="l">${l}</span></div>`).join('');

  const alerts=document.getElementById('hilosAlerts');
  const urgentes=(h.hilos||[]).filter(x=>x.alerta&&!x.legado).slice(0,5);
  alerts.innerHTML=urgentes.map(x=>{
    const urgent=x.semaforo&&x.semaforo.kind==='vencido';
    return `<div class="hilo-alert${urgent?' urgent':''}">${escapeHtml(x.alerta)}</div>`;
  }).join('');

  const tb=document.querySelector('#hilosTable tbody');
  tb.innerHTML='';
  let list=h.hilos||[];
  if(pendMode==='comunicacion'){
    tb.innerHTML='<tr><td colspan="8" style="color:var(--text-muted);padding:16px">Los hilos de semáforo aplican a deudas (Yo debo / Me deben), no a traslados puros.</td></tr>';
    return;
  }
  if(!list.length){
    tb.innerHTML='<tr><td colspan="8" style="color:var(--text-muted);padding:16px">Sin hilos en este foco. Prueba “Todos abiertos” si buscas legado.</td></tr>';
    return;
  }
  list.forEach((g,idx)=>{
    const tr=document.createElement('tr');
    tr.className='hilo-row row-rendered'+(hiloExpanded===idx?' expanded':'');
    tr.style.animationDelay=`${Math.min(idx*12,180)}ms`;
    tr.innerHTML=`<td>${semaforoHtml(g.semaforo)}</td>
      <td><strong>${escapeHtml(g.titulo)}</strong></td>
      <td>${escapeHtml(g.especialidad_norm||'—')}</td>
      <td class="num">${g.dias!=null?g.dias:'—'}</td>
      <td>${escapeHtml(g.fecha_ancla||'—')}</td>
      <td class="num">${g.n_cartas||0}</td>
      <td class="num">${g.n_abiertas||0}</td>
      <td>${escapeHtml(g.fecha_inicio||'—')}</td>`;
    tr.addEventListener('click',()=>{
      hiloExpanded=hiloExpanded===idx?null:idx;
      renderHilos();
    });
    tb.appendChild(tr);
    if(hiloExpanded===idx){
      const det=document.createElement('tr');
      const docs=(g.docs||[]).slice(0,12).map(d=>`<code>${escapeHtml(d||'')}</code>`).join(' ');
      const extra=(g.docs||[]).length>12?` +${(g.docs||[]).length-12} más`:'';
      const desdeIni=g.dias_desde_inicio!=null?` · edad desde inicio: ${g.dias_desde_inicio}d`:'';
      det.innerHTML=`<td colspan="8" class="hilo-detail">
        ${g.hilo_id!=null?`<div style="font-size:11px;color:var(--accent);margin-bottom:6px"><i class="ri-mail-thread-line"></i> Hilo FK #${g.hilo_id}${g.clave?' · '+escapeHtml(g.clave):''}</div>`:''}
        Reloj desde ancla (última abierta con deuda)${desdeIni}. Documentos: ${docs||'—'}${extra}
        <div style="margin-top:8px">
          <button type="button" class="btn-jump-cartas" data-hilo-ids="${(g.carta_ids||[]).join(',')}">Ver ${g.n_cartas||0} cartas</button>
        </div>
      </td>`;
      tb.appendChild(det);
      const btn=det.querySelector('button[data-hilo-ids]');
      if(btn)btn.addEventListener('click',(ev)=>{
        ev.stopPropagation();
        const ids=new Set((btn.dataset.hiloIds||'').split(',').map(x=>parseInt(x,10)).filter(Boolean));
        resetFilters();
        if(pendMode==='debo'||pendMode==='me_deben'){
          document.getElementById('filterNaturaleza').value='respuesta';
          document.getElementById('filterDeuda').value=pendMode;
        }
        filtered=ALL_CARTAS.filter(c=>ids.has(c.id));
        currentPage=1;
        document.getElementById('tableCountInline').textContent=filtered.length;
        document.getElementById('jumpCount').textContent=filtered.length;
        showView('cartas');
        updateTable();
        showToast(`Mostrando ${filtered.length} cartas del hilo`,'info');
      });
    }
  });
}

async function loadHilos(){
  if(pendMode==='comunicacion'){
    HILOS={hilos:[],counts:{},plazo_dias:5};
    return;
  }
  const deuda=pendMode==='debo'||pendMode==='me_deben'?pendMode:'';
  const q=new URLSearchParams({solo_abiertos:'1', foco:hiloFoco||'operativo'});
  if(deuda)q.set('deuda',deuda);
  const r=await apiFetch('/api/hilos?'+q.toString());
  if(!r.ok)throw new Error('hilos');
  HILOS=await r.json();
}

function applyPendienteToFilters(mode,actor,esp,opts){
  opts=opts||{};
  resetFiltersSilent();
  initBandejas();
  const BANDEJA_CONTRAPARTE={supervisor:'recibida_sup',entidad:'recibida_pronis',municipalidad:'recibida_mpsc'};
  if(mode==='comunicacion'){
    document.getElementById('filterNaturaleza').value='comunicacion';
    document.getElementById('filterDeuda').value='all';
  }else if(mode==='debo'||mode==='me_deben'){
    document.getElementById('filterNaturaleza').value='all';
    document.getElementById('filterDeuda').value=mode;
  }
  if(actor&&actor!=='all'){
    document.getElementById('filterContraparte').value=actor;
    if(mode==='debo'&&BANDEJA_CONTRAPARTE[actor]){
      document.getElementById('filterBandeja').value=BANDEJA_CONTRAPARTE[actor];
      activeBandeja=BANDEJA_CONTRAPARTE[actor];
    }
  }
  if(esp&&esp!=='all'){
    const sel=document.getElementById('filterEsp');
    if(![...sel.options].some(o=>o.value===esp)){
      const o=document.createElement('option');o.value=esp;o.textContent=esp;sel.appendChild(o);
    }
    sel.value=esp;
  }
  if(opts.ids&&opts.ids.length){
    const idSet=new Set(opts.ids.map(x=>parseInt(x,10)).filter(Boolean));
    filtered=ALL_CARTAS.filter(c=>idSet.has(c.id));
  }else{
    filtered=ALL_CARTAS.filter(c=>cartaMatchesPendiente(c,mode,actor||'all',esp||'all'));
  }
  filtered.sort((a,b)=>{
    const fa=parseDate(a.fecha),fb=parseDate(b.fecha);
    if(fa&&fb&&fa.getTime()!==fb.getTime())return fb-fa;
    return(b.id||0)-(a.id||0);
  });
  currentPage=1;
  document.getElementById('btnReset').classList.add('visible');
  document.getElementById('filterActiveTag').classList.add('visible');
  syncCartasSearchUI();
  updateTable();
  const cpLabel=actor&&actor!=='all'?(ACTOR_LABELS[actor]||actor):'todas las contrapartes';
  goToCartasWithFilters(filtered.length?`${filtered.length} carta${filtered.length===1?'':'s'} — ${esp&&esp!=='all'?esp+' · ':''}${cpLabel}`:null);
}

function updateAll(){updateKPIs();updateDeadlineAlerts();updateCharts();updateTable();if(currentView==='pendientes')renderPendientes();if(currentView==='saldos')renderSaldos();}

