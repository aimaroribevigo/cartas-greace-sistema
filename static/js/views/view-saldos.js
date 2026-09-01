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
  const subEl = document.getElementById('saldosSub');
  if(subEl){
    subEl.textContent = s.vista_parcial
      ? (s.nota||'Vista filtrada por tus especialidades asignadas.')
      : 'Haz clic en cualquier número para ver directamente las cartas de esa especialidad.';
  }

  const kpisEl = document.getElementById('saldosKpis');
  if(kpisEl){
    const totalTramites = (c.le_deben||0) + (c.cggc_debe||0);
    const pctPropio = totalTramites ? Math.round((c.cggc_debe||0) / totalTramites * 100) : 0;
    const saldoNeto = c.saldo_neto||0;
    kpisEl.innerHTML=`
      <div class="kpi-card kpi-rendered" style="border-left:4px solid var(--amber)">
        <div class="kpi-icon" style="background:var(--amber-light);color:#8A6A20"><i class="ri-mail-send-line"></i></div>
        <div class="kpi-value">${c.le_deben||0}</div>
        <div class="kpi-label">🟡 Esperando a Contraparte</div>
        <div class="kpi-sub">Cartas emitidas pendientes de respuesta</div>
      </div>
      <div class="kpi-card kpi-rendered" style="border-left:4px solid var(--rose)">
        <div class="kpi-icon" style="background:var(--rose-light);color:var(--rose)"><i class="ri-inbox-unarchive-line"></i></div>
        <div class="kpi-value">${c.cggc_debe||0}</div>
        <div class="kpi-label">🔴 Pendientes de Responder</div>
        <div class="kpi-sub">Cartas recibidas por contestar</div>
      </div>
      <div class="kpi-card kpi-rendered" style="border-left:4px solid var(--teal)">
        <div class="kpi-icon" style="background:var(--teal-light);color:var(--teal)"><i class="ri-scales-3-line"></i></div>
        <div class="kpi-value" style="color:${saldoNeto>=0?'var(--teal)':'var(--rose)'}">${saldoNeto>0?'+':''}${saldoNeto}</div>
        <div class="kpi-label">⚖️ Balance Neto</div>
        <div class="kpi-sub">${saldoNeto>=0?'Mayor volumen a favor de obra':'Mayor carga por responder'}</div>
      </div>
      <div class="kpi-card kpi-rendered" style="border-left:4px solid var(--sage)">
        <div class="kpi-icon" style="background:var(--sage-light);color:var(--sage)"><i class="ri-pie-chart-line"></i></div>
        <div class="kpi-value">${pctPropio}%</div>
        <div class="kpi-label">📊 % Carga Operativa Propia</div>
        <div class="kpi-sub">Proporción que depende de nosotros</div>
      </div>`;
  }

  const tb=document.querySelector('#saldosTable tbody');
  if(!tb) return;
  tb.innerHTML='';
  let sumLe=0, sumDeb=0, sumNet=0;

  // Ordenar de mayor a menor urgencia: primero las que tienen más cartas por responder
  const sortedList = [...(s.by_especialidad||[])].sort((a, b) => {
    if ((b.cggc_debe||0) !== (a.cggc_debe||0)) {
      return (b.cggc_debe||0) - (a.cggc_debe||0);
    }
    return (b.le_deben||0) - (a.le_deben||0);
  });

  sortedList.forEach((r,idx)=>{
    sumLe+=r.le_deben; sumDeb+=r.cggc_debe; sumNet+=r.saldo_neto;
    const tr=document.createElement('tr');
    tr.className='row-rendered';
    tr.style.animationDelay=`${Math.min(idx*15,200)}ms`;
    
    let riskBadge = '';
    if ((r.cggc_debe||0) >= 10 || r.nivel_riesgo === 'ALTO') {
      riskBadge = `<span class="saldos-badge-critico">🔴 Crítico (${r.cggc_debe} por responder)</span>`;
    } else if ((r.cggc_debe||0) > 0) {
      riskBadge = `<span class="saldos-badge-medio">🟡 Atención (${r.cggc_debe} pendientes)</span>`;
    } else if ((r.le_deben||0) > 0) {
      riskBadge = `<span class="saldos-badge-medio" style="background:#F4EFEB;color:#6E5C4F">⏳ Esperando respuesta</span>`;
    } else {
      riskBadge = `<span class="saldos-badge-ok">🟢 Al Día</span>`;
    }

    tr.innerHTML=`
      <td><strong>${escapeHtml(r.especialidad)}</strong></td>
      <td class="col-center" data-esp="${escapeHtml(r.especialidad)}" data-deuda="debo" style="cursor:pointer;color:var(--rose);font-weight:700;font-size:14px;" title="Clic para ver cartas que debemos responder en ${escapeHtml(r.especialidad)}">${r.cggc_debe}</td>
      <td class="col-center" data-esp="${escapeHtml(r.especialidad)}" data-deuda="me_deben" style="cursor:pointer;color:#8A6A20;font-weight:600;font-size:13px;" title="Clic para ver cartas esperando a contraparte en ${escapeHtml(r.especialidad)}">${r.le_deben}</td>
      <td class="col-center"><strong style="font-size:13px;color:${r.saldo_neto>=0?'var(--teal)':'var(--rose)'}">${r.saldo_neto>0?'+':''}${r.saldo_neto}</strong></td>
      <td class="col-center">${riskBadge}</td>`;
    tb.appendChild(tr);
  });

  if(sortedList.length){
    const trTot=document.createElement('tr');
    trTot.style.background='var(--bg-card)';
    trTot.style.fontWeight='700';
    trTot.style.borderTop='2px solid var(--border)';
    trTot.innerHTML=`
      <td><strong>TOTALES GENERALES</strong></td>
      <td class="col-center" data-esp="all" data-deuda="debo" style="cursor:pointer;color:var(--rose);font-weight:800;font-size:15px;" title="Ver todas las cartas que debemos responder (${sumDeb})">${sumDeb}</td>
      <td class="col-center" data-esp="all" data-deuda="me_deben" style="cursor:pointer;color:#8A6A20;font-weight:700;font-size:14px;" title="Ver todas las cartas esperando a contraparte (${sumLe})">${sumLe}</td>
      <td class="col-center"><strong style="font-size:14px;color:${sumNet>=0?'var(--teal)':'var(--rose)'}">${sumNet>0?'+':''}${sumNet}</strong></td>
      <td class="col-center" style="font-size:11.5px;color:var(--text-muted);font-weight:600">Total acumulado de obra</td>`;
    tb.appendChild(trTot);
  }
  tb.querySelectorAll('td.col-center[data-esp]').forEach(td=>{
    td.addEventListener('click',()=>{
      const esp=td.dataset.esp, deuda=td.dataset.deuda;
      applyPendienteToFilters(deuda,'all',esp);
    });
  });

  const thead=document.querySelector('#statusTable thead');
  const stb=document.querySelector('#statusTable tbody');
  if(thead && stb){
    const estados=st.estados||[];
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
}

async function ensureSaldosLoaded(force = false){
  if(saldosLoaded && !force && SALDOS && SALDOS.por_bandeja){
    renderSaldos();
    return;
  }
  if(typeof showViewLoading==='function') showViewLoading(true, 'Cargando Resumen de Saldos…', 'Consolidando balance de cartas');
  try{
    const [saldos, status] = await Promise.all([
      apiFetch('/api/saldos').then(r=>r.ok?r.json():{}).catch(()=>({})),
      apiFetch('/api/status/supervision').then(r=>r.ok?r.json():{}).catch(()=>({}))
    ]);
    SALDOS = saldos || {};
    STATUS_SUP = status || {};
    saldosLoaded = true;
    renderSaldos();
  }catch(e){
    console.error('Error al cargar saldos:', e);
  }finally{
    if(typeof showViewLoading==='function') showViewLoading(false);
  }
}

async function refreshData(isBackground = true){
  pendientesLoaded = false;
  saldosLoaded = false;
  reportesLoaded = false;
  return await loadData(isBackground);
}

async function loadData(isBackground = false){
  try{
    const ok=await ensureSession();
    if(!ok)return;
    if(!isBackground && (!ALL_CARTAS || ALL_CARTAS.length === 0)){
      if(typeof showViewLoading==='function') showViewLoading(true, 'Cargando Control de Cartas…', 'Sincronizando información en tiempo real');
    }
    // Carga exclusiva e inmediata de cartas y stats (Control de Cartas)
    const [cartas, stats] = await Promise.all([
      fetchCartas(),
      fetchStats()
    ]);
    ALL_CARTAS = cartas;
    STATS = stats;
    prepareCartasSearchCache(ALL_CARTAS);
    BANDEJAS_META = stats.bandejas_meta || BANDEJAS_META;
    ACTORES_META = stats.actores_meta || ACTOR_LABELS;
    if(stats.user) applyUserChrome(stats.user);
    applyCatalogoFromStats(stats);
    applyPlazosConfig(stats);
    initBandejas();
    initFilters();
    updateHeroMeta();
    applyFilters(true);

    // Activar únicamente la vista que el usuario tiene abierta actualmente
    if(currentView==='cartas'){
      requestAnimationFrame(setupCartasSearchFloat);
    } else if(currentView==='pendientes'){
      ensurePendientesLoaded(true);
    } else if(currentView==='saldos'){
      ensureSaldosLoaded(true);
    } else if(currentView==='reportes'){
      updateCharts();
      reportesLoaded = true;
    }
  }catch(e){
    showCartasLoading(false);
    console.error(e);
    if(String(e.message||'').includes('autenticado'))return;
    showToast('Error al cargar datos: '+e.message,'error');
  }finally{
    if(!isBackground && typeof showViewLoading==='function'){
      // Si estamos en cartas o reportes, quitar overlay
      if(['cartas','reportes'].includes(currentView)) showViewLoading(false);
    }
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
