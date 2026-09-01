function renderSaldosSkeleton(){
  const kpiEl=document.getElementById('saldosKpis');
  if(kpiEl){
    let kpiHtml='';
    for(let i=0;i<4;i++){
      kpiHtml+=`
        <div class="kpi-card skeleton-card">
          <div class="skeleton" style="width:36px;height:36px;border-radius:9px;margin-bottom:12px"></div>
          <div class="skeleton" style="width:70px;height:32px;margin-bottom:8px"></div>
          <div class="skeleton" style="width:115px;height:13px;margin-bottom:8px"></div>
          <div class="skeleton" style="width:85px;height:11px"></div>
        </div>`;
    }
    kpiEl.innerHTML=kpiHtml;
  }
  const stb=document.querySelector('#saldosTable tbody');
  if(stb){
    let tbHtml='';
    for(let i=0;i<6;i++){
      const wEsp=100+(i%3)*20;
      tbHtml+=`
        <tr class="skeleton-row">
          <td><div class="skeleton skeleton-text" style="width:${wEsp}px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:32px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:32px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:36px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:38px"></div></td>
          <td><div class="skeleton skeleton-badge" style="width:58px;height:18px"></div></td>
        </tr>`;
    }
    stb.innerHTML=tbHtml;
  }
  const statb=document.querySelector('#statusTable tbody');
  if(statb){
    let statHtml='';
    for(let i=0;i<6;i++){
      statHtml+=`
        <tr class="skeleton-row">
          <td><div class="skeleton skeleton-text" style="width:110px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:28px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:28px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:28px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:28px"></div></td>
          <td class="num"><div class="skeleton skeleton-text" style="width:34px"></div></td>
        </tr>`;
    }
    statb.innerHTML=statHtml;
  }
}

function renderSaldos(){
  const s=SALDOS||{}, st=STATUS_SUP||{};
  const c=s.counts||{le_deben:0,cggc_debe:0,saldo_neto:0};
  const tgt=s.excel_target||{};
  document.getElementById('saldosSub').textContent=s.vista_parcial
    ? (s.nota||'Vista parcial por especialidad — no compares con Excel global.')
    : `Saldo = Le deben − CGGC debe. Riesgo alto si la deuda propia domina (≥66%) o el saldo es muy negativo.`;
  const parityOk=!s.vista_parcial&&c.le_deben===tgt.le_deben&&c.cggc_debe===tgt.cggc_debe;
  document.getElementById('saldosKpis').innerHTML=`
    <div class="kpi-card kpi-rendered"><div class="kpi-icon" style="background:var(--amber-light);color:#8A6A20"><i class="ri-arrow-left-down-line"></i></div><div class="kpi-value">${c.le_deben||0}</div><div class="kpi-label">Le Deben al CGGC</div><div class="kpi-sub">${s.vista_parcial?'Tu alcance':('Excel meta: '+(tgt.le_deben??'—'))}</div></div>
    <div class="kpi-card kpi-rendered"><div class="kpi-icon" style="background:var(--rose-light);color:var(--rose)"><i class="ri-arrow-right-up-line"></i></div><div class="kpi-value">${c.cggc_debe||0}</div><div class="kpi-label">El CGGC Le Debe</div><div class="kpi-sub">${s.vista_parcial?'Tu alcance':('Excel meta: '+(tgt.cggc_debe??'—'))}</div></div>
    <div class="kpi-card kpi-rendered"><div class="kpi-icon" style="background:var(--teal-light);color:var(--teal)"><i class="ri-scales-3-line"></i></div><div class="kpi-value">${c.saldo_neto||0}</div><div class="kpi-label">Saldo neto</div><div class="kpi-sub">${s.vista_parcial?'Parcial':('Excel meta: '+(tgt.saldo_neto??'—'))}</div></div>
    <div class="kpi-card kpi-rendered"><div class="kpi-icon" style="background:var(--sage-light);color:var(--sage)"><i class="ri-checkbox-circle-line"></i></div><div class="kpi-value">${s.vista_parcial?'ESP':(parityOk?'OK':'Δ')}</div><div class="kpi-label">${s.vista_parcial?'Vista ingeniero':'Paridad Excel'}</div><div class="kpi-sub">${s.vista_parcial?((CURRENT_USER&&CURRENT_USER.especialidades||[]).join(', ')||'—'):('Δ le='+((c.le_deben||0)-(tgt.le_deben||0))+' · Δ debe='+((c.cggc_debe||0)-(tgt.cggc_debe||0)))}</div></div>`;
  const tb=document.querySelector('#saldosTable tbody');
  tb.innerHTML='';
  let sumLe=0, sumDeb=0, sumNet=0;
  (s.by_especialidad||[]).forEach((r,idx)=>{
    sumLe+=r.le_deben; sumDeb+=r.cggc_debe; sumNet+=r.saldo_neto;
    const tr=document.createElement('tr');
    tr.className='row-rendered';
    tr.style.animationDelay=`${Math.min(idx*15,200)}ms`;
    const risk=r.nivel_riesgo||'BAJO';
    const riskColor=risk==='ALTO'?'var(--rose)':risk==='MEDIO'?'#8A6A20':'var(--sage)';
    tr.innerHTML=`
      <td><strong>${escapeHtml(r.especialidad)}</strong></td>
      <td class="num" data-esp="${escapeHtml(r.especialidad)}" data-deuda="me_deben" style="cursor:pointer" title="Ver cartas: Me deben en ${escapeHtml(r.especialidad)}">${r.le_deben}</td>
      <td class="num" data-esp="${escapeHtml(r.especialidad)}" data-deuda="debo" style="cursor:pointer" title="Ver cartas: Yo debo en ${escapeHtml(r.especialidad)}">${r.cggc_debe}</td>
      <td class="num"><strong>${r.saldo_neto}</strong></td>
      <td class="num">${Math.round((r.pct_deuda_propia||0)*100)}%</td>
      <td style="color:${riskColor};font-weight:700">${risk}</td>`;
    tb.appendChild(tr);
  });
  if((s.by_especialidad||[]).length){
    const trTot=document.createElement('tr');
    trTot.style.background='var(--bg-card)';
    trTot.style.fontWeight='700';
    trTot.style.borderTop='2px solid var(--border)';
    const pctTot=(sumLe+sumDeb)?Math.round(sumDeb/(sumLe+sumDeb)*100):0;
    trTot.innerHTML=`
      <td>TOTALES</td>
      <td class="num" data-esp="all" data-deuda="me_deben" style="cursor:pointer" title="Ver todas las cartas: Me deben (${sumLe})">${sumLe}</td>
      <td class="num" data-esp="all" data-deuda="debo" style="cursor:pointer" title="Ver todas las cartas: Yo debo (${sumDeb})">${sumDeb}</td>
      <td class="num"><strong>${sumNet}</strong></td>
      <td class="num">${pctTot}%</td>
      <td>—</td>`;
    tb.appendChild(trTot);
  }
  tb.querySelectorAll('td.num[data-esp]').forEach(td=>{
    td.addEventListener('click',()=>{
      const esp=td.dataset.esp, deuda=td.dataset.deuda;
      applyPendienteToFilters(deuda,'all',esp);
    });
  });

  const estados=st.estados||[];
  const thead=document.querySelector('#statusTable thead');
  const stb=document.querySelector('#statusTable tbody');
  thead.innerHTML='<tr><th>Especialidad</th>'+estados.map(e=>`<th>${escapeHtml(e)}</th>`).join('')+'<th>Total</th></tr>';
  stb.innerHTML='';
  const colSums={};
  estados.forEach(e=>{colSums[e]=0;});
  let grandTotal=0;
  (st.rows||[]).forEach((r,idx)=>{
    grandTotal+=(r.total||0);
    estados.forEach(e=>{colSums[e]+=(r[e]||0);});
    const tr=document.createElement('tr');
    tr.className='row-rendered';
    tr.style.animationDelay=`${Math.min(idx*15,200)}ms`;
    const cells=estados.map(e=>{
      const val=r[e]||0;
      if(!val)return `<td class="num" style="color:var(--text-muted);cursor:default">0</td>`;
      return `<td class="num" data-esp="${escapeHtml(r.especialidad)}" data-estado="${escapeHtml(e)}" style="cursor:pointer" title="Ver cartas: ${escapeHtml(e)} en ${escapeHtml(r.especialidad)}">${val}</td>`;
    }).join('');
    tr.innerHTML=`<td><strong>${escapeHtml(r.especialidad)}</strong></td>`+cells+`<td class="num"><strong>${r.total||0}</strong></td>`;
    stb.appendChild(tr);
  });
  if((st.rows||[]).length){
    const trTot=document.createElement('tr');
    trTot.style.background='var(--bg-card)';
    trTot.style.fontWeight='700';
    trTot.style.borderTop='2px solid var(--border)';
    const cellsTot=estados.map(e=>`<td class="num">${colSums[e]||0}</td>`).join('');
    trTot.innerHTML=`<td>TOTALES</td>`+cellsTot+`<td class="num"><strong>${grandTotal}</strong></td>`;
    stb.appendChild(trTot);
  }
  stb.querySelectorAll('td.num[data-estado]').forEach(td=>{
    td.addEventListener('click',()=>{
      const esp=td.dataset.esp, estado=td.dataset.estado;
      resetFilters();
      document.getElementById('filterBandeja').value='recibida_sup';
      activeBandeja='recibida_sup';
      if(estado&&estado!=='all')document.getElementById('filterEstado').value=estado;
      if(esp&&esp!=='all'){
        const sel=document.getElementById('filterEsp');
        if(![...sel.options].some(o=>o.value===esp)){
          const o=document.createElement('option');o.value=esp;o.textContent=esp;sel.appendChild(o);
        }
        sel.value=esp;
      }
      applyFilters();
      goToCartasWithFilters();
    });
  });
}

async function refreshData(isBackground = true){
  return await loadData(isBackground);
}

async function loadData(isBackground = false){
  try{
    const ok=await ensureSession();
    if(!ok)return;
    if(!isBackground && (!ALL_CARTAS || ALL_CARTAS.length === 0)){
      renderTableSkeleton(8);
      renderSaldosSkeleton();
      renderPendientesSkeleton();
      renderReportesSkeleton();
    }
    const[cartas,stats,pend,saldos,status]=await Promise.all([
      fetchCartas(),
      fetchStats(),
      apiFetch('/api/pendientes').then(r=>{if(!r.ok)throw new Error('pendientes');return r.json();}),
      apiFetch('/api/saldos').then(r=>{if(!r.ok)throw new Error('saldos');return r.json();}),
      apiFetch('/api/status/supervision').then(r=>{if(!r.ok)throw new Error('status');return r.json();})
    ]);
    ALL_CARTAS=cartas;STATS=stats;PENDIENTES=pend;SALDOS=saldos;STATUS_SUP=status;
    prepareCartasSearchCache(ALL_CARTAS);
    BANDEJAS_META=stats.bandejas_meta||BANDEJAS_META;
    ACTORES_META=stats.actores_meta||ACTOR_LABELS;
    if(stats.user)applyUserChrome(stats.user);
    applyCatalogoFromStats(stats);
    applyPlazosConfig(stats);initBandejas();initFilters();updateHeroMeta();applyFilters();
    if(currentView==='pendientes'){
      try{await loadHilos();}catch(e){console.warn('hilos',e);HILOS={hilos:[],counts:{}};}
      renderPendientes();
    } else {
      if(window.requestIdleCallback){
        requestIdleCallback(()=>{loadHilos().catch(()=>{});},{timeout:800});
      } else {
        setTimeout(()=>{loadHilos().catch(()=>{});},150);
      }
    }
    if(currentView==='saldos')renderSaldos();
    if(currentView==='cartas')requestAnimationFrame(setupCartasSearchFloat);
  }catch(e){
    showCartasLoading(false);
    console.error(e);
    if(String(e.message||'').includes('autenticado'))return;
    showToast('Error al cargar datos: '+e.message,'error');
  }
}

function updatePagination(start,shown){
  const info=document.getElementById('paginationInfo'),ctrl=document.getElementById('paginationControls');
  const total=filtered.length;
  if(!info||!ctrl)return;
  if(!total){
    info.innerHTML='<span style="color:var(--text-muted)">Sin resultados</span>';
    ctrl.innerHTML='';
    return;
  }
  const pages=totalPages();
  const startItem=start+1;
  const endItem=Math.min(start+shown,total);
  info.innerHTML=`
    <span style="font-weight:500">Mostrando <strong style="color:var(--text-primary);font-weight:700">${startItem}–${endItem}</strong> de <strong style="color:var(--text-primary);font-weight:700">${total}</strong> cartas</span>
    <span class="badge-soft" style="font-size:11px;padding:3px 8px;font-weight:700;color:var(--text-secondary);background:#ECE8E1;border:1px solid #DFD9CE;border-radius:5px">
      Página ${currentPage} de ${pages}
    </span>`;
  ctrl.innerHTML='';
  const mkBtn=(html,page,disabled=false,active=false,title='')=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='btn-page'+(active?' active':'');
    b.innerHTML=html;
    b.disabled=disabled;
    if(title)b.title=title;
    b.onclick=()=>setPage(page);
    ctrl.appendChild(b);
  };
  const mkEllipsis=()=>{
    const span=document.createElement('span');
    span.className='btn-page-ellipsis';
    span.textContent='…';
    ctrl.appendChild(span);
  };

  // 1. Primera página (⏮)
  mkBtn('<i class="ri-skip-back-mini-line"></i>',1,currentPage<=1,false,'Primera página (Pág. 1)');
  // 2. Página anterior (◀)
  mkBtn('<i class="ri-arrow-left-s-line"></i>',currentPage-1,currentPage<=1,false,'Página anterior');

  // 3. Botones numéricos inteligentes con elipsis
  if(pages<=7){
    for(let p=1;p<=pages;p++){
      mkBtn(String(p),p,false,p===currentPage,`Página ${p}`);
    }
  } else {
    mkBtn('1',1,false,currentPage===1,'Página 1');
    let from=Math.max(2,currentPage-1);
    let to=Math.min(pages-1,currentPage+1);
    if(currentPage<=3){
      from=2;to=4;
    } else if(currentPage>=pages-2){
      from=pages-3;to=pages-1;
    }
    if(from>2)mkEllipsis();
    for(let p=from;p<=to;p++){
      mkBtn(String(p),p,false,p===currentPage,`Página ${p}`);
    }
    if(to<pages-1)mkEllipsis();
    mkBtn(String(pages),pages,false,currentPage===pages,`Página ${pages}`);
  }

  // 4. Página siguiente (▶)
  mkBtn('<i class="ri-arrow-right-s-line"></i>',currentPage+1,currentPage>=pages,false,'Página siguiente');
  // 5. Última página (⏭)
  mkBtn('<i class="ri-skip-forward-mini-line"></i>',pages,currentPage>=pages,false,`Última página (Pág. ${pages})`);

  // 6. Desplegable rápido ("Ir a página...")
  if(pages>1){
    const jumpWrap=document.createElement('div');
    jumpWrap.className='pagination-jump-wrap';
    const jumpLabel=document.createElement('label');
    jumpLabel.htmlFor='cartasPageJump';
    jumpLabel.className='pagination-jump-label';
    jumpLabel.textContent='Ir a:';
    const jumpSelect=document.createElement('select');
    jumpSelect.id='cartasPageJump';
    jumpSelect.className='pagination-select';
    jumpSelect.setAttribute('aria-label','Seleccionar página directa');
    for(let p=1;p<=pages;p++){
      const opt=document.createElement('option');
      opt.value=p;
      const pStart=(p-1)*PAGE_SIZE+1;
      const pEnd=Math.min(p*PAGE_SIZE,total);
      opt.textContent=`Pág. ${p} (${pStart}–${pEnd})`;
      if(p===currentPage)opt.selected=true;
      jumpSelect.appendChild(opt);
    }
    jumpSelect.onchange=(e)=>{
      const targetPage=parseInt(e.target.value,10);
      if(!isNaN(targetPage)&&targetPage>=1&&targetPage<=pages){
        setPage(targetPage);
      }
    };
    jumpWrap.appendChild(jumpLabel);
    jumpWrap.appendChild(jumpSelect);
    ctrl.appendChild(jumpWrap);
  }
}

const DESTINATARIOS_BY_EMISOR = {
  RO: [
    { value: 'Supervisión', label: 'Supervisión' },
    { value: 'Municipalidad', label: 'Municipalidad' }
  ],
  RL: [
    { value: 'Supervisión', label: 'Supervisión' },
    { value: 'Pronis', label: 'Pronis' },
    { value: 'JRD', label: 'JRD' }
  ],
  SUPERVISOR: [
    { value: 'Residente (RO)', label: 'Residente (RO)' },
    { value: 'Representante Legal (RL)', label: 'Representante Legal (RL)' }
  ],
  PRONIS: [
    { value: 'Representante Legal (RL)', label: 'Representante Legal (RL)' },
    { value: 'Residente (RO)', label: 'Residente (RO)' }
  ],
  JRD: [
    { value: 'Representante Legal (RL)', label: 'Representante Legal (RL)' },
    { value: 'Residente (RO)', label: 'Residente (RO)' }
  ],
  MUNICIPALIDAD: [
    { value: 'Residente (RO)', label: 'Residente (RO)' },
    { value: 'Representante Legal (RL)', label: 'Representante Legal (RL)' }
  ]
};

function updateDestinatarioOptions(selectedDest){
  const emisor = document.getElementById('f_emisor')?.value || 'RO';
  const destSel = document.getElementById('f_destinatario');
  if(!destSel) return;
  const opts = DESTINATARIOS_BY_EMISOR[emisor] || DESTINATARIOS_BY_EMISOR.RO;
  destSel.innerHTML = opts.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
  
  if(selectedDest){
    const found = opts.find(o => o.value.toUpperCase() === String(selectedDest).toUpperCase() || selectedDest.toUpperCase().includes(o.value.toUpperCase()));
    if(found){
      destSel.value = found.value;
    } else {
      ensureSelectOption(destSel, selectedDest);
      destSel.value = selectedDest;
    }
  } else if(opts.length > 0){
    destSel.value = opts[0].value;
  }
  updatePlazoFromActors();
}

function updatePlazoFromActors(){
  const emisor = document.getElementById('f_emisor')?.value || 'RO';
  const dest = document.getElementById('f_destinatario')?.value || '';
  const reqResp = document.getElementById('f_requiere_respuesta')?.checked ?? true;
  const plazoInput = document.getElementById('f_plazo_dias');
  const hint = document.getElementById('plazoHint');
  if(!plazoInput) return;

  if(!reqResp){
    plazoInput.value = '0';
    if(hint) hint.textContent = 'Solo informativa / No genera plazo';
    return;
  }

  const cfg = (typeof SYSTEM_CONFIG === 'object' && SYSTEM_CONFIG) || {};
  let defaultPlazo = 5;
  const target = (['SUPERVISOR', 'PRONIS', 'MUNICIPALIDAD', 'JRD'].includes(emisor)) ? emisor : dest.toUpperCase();

  if (target.includes('SUPERVIS')) defaultPlazo = parseInt(cfg.plazo_sup_dias || 5, 10);
  else if (target.includes('PRONIS') || target.includes('ENTIDAD')) defaultPlazo = parseInt(cfg.plazo_entidad_dias || 15, 10);
  else if (target.includes('MUNICIPAL')) defaultPlazo = parseInt(cfg.plazo_muni_dias || 15, 10);
  else if (target.includes('JRD')) defaultPlazo = parseInt(cfg.plazo_jrd_dias || 15, 10);
  else defaultPlazo = parseInt(cfg.plazo_ro_dias || 5, 10);

  if(!plazoInput.value || plazoInput.dataset.auto === '1' || editingId == null){
    plazoInput.value = defaultPlazo;
    plazoInput.dataset.auto = '1';
  }
  if(hint) hint.textContent = `Días contractuales (${defaultPlazo} d según config)`;
}

let cartaPadreSearchInitialized = false;
