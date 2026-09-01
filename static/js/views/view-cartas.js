function showView(view){
  if(!['reportes','cartas','pendientes','saldos','usuarios','configuracion'].includes(view))view='reportes';
  if(['usuarios','configuracion'].includes(view)&&!(CURRENT_USER&&CURRENT_USER.can_manage_users))view='reportes';
  currentView=view;
  document.body.classList.toggle('view-reportes',view==='reportes');
  document.body.classList.toggle('view-cartas',view==='cartas');
  document.body.classList.toggle('view-pendientes',view==='pendientes');
  document.body.classList.toggle('view-saldos',view==='saldos');
  document.body.classList.toggle('view-usuarios',view==='usuarios');
  document.body.classList.toggle('view-configuracion',view==='configuracion');
  document.querySelectorAll('.view-panel').forEach(el=>el.classList.toggle('active',el.id==='view-'+view));
  document.querySelectorAll('.view-tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view));
  const titles={
    reportes:'Reportes e Indicadores',
    pendientes:'Pendientes de Atención',
    saldos:'Resumen de Saldos Excel',
    cartas:'Control Operativo de Cartas',
    usuarios:'Gestión de Usuarios',
    configuracion:'Configuración General del Sistema'
  };
  const subs={
    reportes:'Indicadores del Control de Cartas HLP: bandejas, estados, plazos, especialidades y deuda de respuesta.',
    pendientes:'Resumen arriba (228 / 175). Abajo: matriz, hilos y acciones según Yo debo / Me deben / Traslados.',
    saldos:'Totales alineados al Excel (175 / 228 / -53). Sin filtros globales: el balance debe verse completo.',
    cartas:'Gestión operativa: aquí sí aplican los filtros de la barra (bandeja, deuda, especialidad, plazo…).',
    usuarios:'Administración de cuentas: roles, especialidades, alta/baja y reset de contraseña.',
    configuracion:'Personaliza la identidad visual, nombres de la obra, logos institucionales y reglas de alerta.'
  };
  const titleEl=document.getElementById('mainHeaderTitle');
  if(titleEl)titleEl.textContent=titles[view]||titles.reportes;
  const subEl=document.getElementById('heroSub');
  if(subEl)subEl.textContent=subs[view]||subs.reportes;
  updateDocumentTitle(view);
  requestAnimationFrame(updateHeaderHeight);
  if(location.hash!=='#'+view)history.replaceState(null,'','#'+view);

  // Carga e inicialización bajo demanda (Lazy Loading) exclusiva por vista
  if(view==='cartas'){
    syncCartasSearchUI();
    if(ALL_CARTAS && ALL_CARTAS.length > 0){
      updateTable();
    }
  }
  else if(view==='reportes'){
    if(!reportesLoaded){
      updateCharts();
      reportesLoaded = true;
    }
    requestAnimationFrame(()=>Object.values(charts).forEach(ch=>ch&&ch.resize()));
  }
  else if(view==='pendientes'){
    if(typeof ensurePendientesLoaded === 'function') ensurePendientesLoaded();
    else if(typeof renderPendientes === 'function') renderPendientes();
  }
  else if(view==='saldos'){
    if(typeof ensureSaldosLoaded === 'function') ensureSaldosLoaded();
    else if(typeof renderSaldos === 'function') renderSaldos();
  }
  else if(view==='usuarios'){
    loadUsersAdmin();
  }
  else if(view==='configuracion'){
    loadConfigAdmin();
  }
  updateFloatingSearchOnScroll();
  closeMobileSidebar();
}

function goToCartasWithFilters(msg){
  currentPage=1;
  showView('cartas');
  document.getElementById('view-cartas')?.scrollIntoView({behavior:'smooth',block:'start'});
  const n=filtered.length;
  if(msg)showToast(msg,'info');
  else showToast(n?`Lista filtrada: ${n} carta${n===1?'':'s'}`:'No hay cartas con estos filtros','info');
}

function setPage(p){
  currentPage = Math.min(Math.max(1, p), totalPages());
  updateTable();
}

function initBandejas(){
  BANDEJAS_META=STATS.bandejas_meta||{};
  const sel=document.getElementById('filterBandeja');
  if(!sel)return;
  const keep=sel.value||activeBandeja||'all';
  sel.innerHTML='';
  const allOpt=document.createElement('option');
  allOpt.value='all';allOpt.textContent='Todas las bandejas';
  sel.appendChild(allOpt);
  BANDEJA_IDS.forEach(id=>{
    const o=document.createElement('option');
    o.value=id;o.textContent=bandejaLabel(id);
    sel.appendChild(o);
  });
  sel.value=(keep==='all'||BANDEJA_IDS.includes(keep))?keep:'all';
  activeBandeja=sel.value;
  const fSel=document.getElementById('f_bandeja');
  if(fSel){
    fSel.innerHTML='';
    BANDEJA_IDS.forEach(id=>{const o=document.createElement('option');o.value=id;o.textContent=bandejaLabel(id);fSel.appendChild(o);});
  }
}

function splitEspecialidades(raw){
  if(!raw)return['SIN ESPECIALIDAD'];
  const parts=String(raw).split(/[,/;\+]|\s{2,}|\s+Y\s+/i).map(s=>s.trim().toUpperCase()).filter(Boolean);
  const norms=parts.filter(p=>p!=='MIXTA');
  return norms.length?norms:['SIN ESPECIALIDAD'];
}

let CATALOGO={especialidades:[],especialistas:[],esp_a_especialista:{}};
const CATALOGO_ESP_FALLBACK=['ESTRUCTURAS','ARQUITECTURA','INST. SANITARIAS','INST. ELECTRICAS','INST. MECANICAS','EQUIPAMIENTO','CALIDAD','SSOMA','BIM','GEOTECNIA','TOPOGRAFIA','MEDIO AMBIENTE','ADM. DE CONTRATOS','COSTOS','COMUNICACIONES','PRODUCCION','CAMPO','RR.HH.'];
const CATALOGO_AREA_FALLBACK=['ESPECIALISTA ESTRUCTURAS','ESPECIALISTA ARQUITECTURA','ESPECIALISTA SANITARIAS','ESPECIALISTA ELECTRICAS','ESPECIALISTA GEOTECNIA','ESPECIALISTA BIM','ESPECIALISTA TOPOGRAFIA','ESPECIALISTA MEDIO AMBIENTE','ESPECIALISTA ADM. CONTRATOS','ESPECIALISTA COSTOS','ESPECIALISTA COMUNICACIONES','ESPECIALISTA PRODUCCION','ESPECIALISTA CAMPO','SSOMA / CALIDAD','EQUIPAMIENTO','RESIDENCIA','OFICINA TECNICA'];

function applyCatalogoFromStats(stats){
  if(stats&&stats.catalogo)CATALOGO=stats.catalogo;
}

function getCatalogoEspecialidadesForUser(){
  const all=(CATALOGO.especialidades&&CATALOGO.especialidades.length)?CATALOGO.especialidades:CATALOGO_ESP_FALLBACK;
  const u=CURRENT_USER;
  if(u&&u.vista_parcial&&u.especialidades&&u.especialidades.length){
    const allowed=new Set(u.especialidades.map(e=>String(e).trim().toUpperCase()));
    const filtered=all.filter(e=>{
      const k=String(e).trim().toUpperCase();
      if(allowed.has(k))return true;
      for(const a of allowed){if(k.includes(a)||a.includes(k))return true;}
      return false;
    });
    return filtered.length?filtered:all;
  }
  return all;
}

function normalizeEspSelectValue(raw){
  const parts=splitEspecialidades(String(raw||''));
  return parts.find(p=>p&&p!=='SIN ESPECIALIDAD'&&p!=='MIXTA')||'';
}

function ensureSelectOption(sel,val,suffix){
  if(!sel||!val)return;
  const v=String(val).trim();
  if(!v)return;
  if(!Array.from(sel.options).some(o=>o.value===v)){
    const opt=document.createElement('option');
    opt.value=v;
    opt.textContent=v+(suffix||' (histórico)');
    sel.appendChild(opt);
  }
  sel.value=v;
}

function populateCartaEspSelect(selected){
  populateFormEspChips(selected);
}

function populateCartaAreaSelect(selected){
  const sel=document.getElementById('f_area');
  if(!sel)return;
  const catalog=(CATALOGO.especialistas&&CATALOGO.especialistas.length)?CATALOGO.especialistas:CATALOGO_AREA_FALLBACK;
  sel.innerHTML='<option value="">— Seleccione especialista —</option>'+
    catalog.map(e=>`<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
  if(selected)ensureSelectOption(sel,String(selected).trim(),' (histórico)');
}

function suggestAreaFromEspecialidad(force){
  const espSel=document.getElementById('f_especialidad');
  const areaSel=document.getElementById('f_area');
  const hint=document.getElementById('f_area_suggest_hint');
  if(!espSel||!areaSel)return;
  const ban=document.getElementById('f_bandeja')?.value||'';
  if(!String(ban).startsWith('recibida')){
    if(hint)hint.style.display='none';
    return;
  }
  const espNorm=normalizeEspSelectValue(espSel.value);
  const map=CATALOGO.esp_a_especialista||{};
  const suggested=map[espNorm];
  if(!suggested){
    if(hint)hint.style.display='none';
    return;
  }
  if(force||!areaSel.value){
    ensureSelectOption(areaSel,suggested);
    areaSel.value=suggested;
  }
  if(hint){
    hint.style.display='block';
    hint.textContent=`Sugerido para «${espNorm}»: ${suggested}. El Admin puede asignar otro especialista si corresponde.`;
  }
}

function initCartaCatalogSelects(espValue,areaValue){
  populateCartaEspSelect(espValue);
  populateCartaAreaSelect(areaValue);
  suggestAreaFromEspecialidad(false);
}

function getCatalogoEspecialidadesList(){
  return (CATALOGO.especialidades&&CATALOGO.especialidades.length)?CATALOGO.especialidades:CATALOGO_ESP_FALLBACK;
}

function populateUserEspSelect(selectedList){
  const sel=document.getElementById('uf_esps');
  if(!sel)return;
  const catalog=getCatalogoEspecialidadesList();
  sel.innerHTML=catalog.map(e=>`<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');
  const wanted=new Set();
  (selectedList||[]).forEach(raw=>{
    const n=normalizeEspSelectValue(raw)||String(raw||'').trim().toUpperCase();
    if(n&&n!=='SIN ESPECIALIDAD')wanted.add(n);
  });
  Array.from(sel.options).forEach(opt=>{
    if(wanted.has(opt.value))opt.selected=true;
  });
  wanted.forEach(v=>{
    if(Array.from(sel.options).some(o=>o.value===v))return;
    const opt=document.createElement('option');
    opt.value=v;
    opt.textContent=v+' (histórico)';
    opt.selected=true;
    sel.appendChild(opt);
  });
}

function getUserEspSelections(){
  const sel=document.getElementById('uf_esps');
  if(!sel)return [];
  return Array.from(sel.selectedOptions).map(o=>o.value.trim()).filter(Boolean);
}

function getCartaEspecialidades(c){
  const raw=String(c.especialidad||'').trim();
  if(raw)return splitEspecialidades(raw);
  const norm=String(c.especialidad_norm||'').trim();
  if(norm&&norm!=='MIXTA')return splitEspecialidades(norm);
  return splitEspecialidades(norm||'');
}

function getTipoDocumentoDisplay(c){
  const t = String(c.tipo_documento || '').trim();
  if(t) return t;
  const doc = String(c.n_documento || '').toUpperCase();
  if(doc.includes('INFORME')) return 'Informe';
  if(doc.includes('OFICIO')) return 'Oficio';
  if(doc.includes('ASIENTO')) return 'Asiento de Cuaderno';
  if(doc.includes('MEMO')) return 'Memorando';
  if(doc.includes('NOTARIAL')) return 'Carta Notarial';
  if(doc.includes('FICHA')) return 'Ficha Técnica';
  if(doc.includes('PLANO')) return 'Planos';
  if(doc.includes('CONSULTA')) return 'Consulta';
  return 'Carta';
}

function formatCartaReferenciaTableHtml(c){
  const currentDocNorm = normalize_doc_key(c.n_documento);
  const currentDt = parseDate(c.fecha)?.getTime() || 0;
  const currentNumMatch = String(c.n_documento || '').match(/\d+/);
  const currentDigits = currentNumMatch ? currentNumMatch[0] : '';
  
  const ref = String(c.referencia || '').trim();
  const rawRefs = String(c.referencias || '').trim();
  const chain = typeof getHiloChainCartas === 'function' ? getHiloChainCartas(c) : [];
  
  // Helper to detect if a text refers to the current carta itself (e.g. "Carta 176 de CALIDAD" on "CARTA N°176...")
  const isSelfReference = (txt) => {
    if(!txt) return true;
    const n = normalize_doc_key(txt);
    if(n === currentDocNorm) return true;
    if(currentDigits && (n === `CARTA ${currentDigits}` || n.startsWith(`CARTA ${currentDigits} `))) {
      return true;
    }
    return false;
  };
  
  const rawParts = [];
  
  // 1. Direct parent carta in the thread (if any)
  const parentCarta = typeof findParentCartaFor === 'function' ? findParentCartaFor(c) : null;
  if(parentCarta && parentCarta.id !== c.id){
    rawParts.push({
      text: parentCarta.n_documento,
      cartaId: parentCarta.id,
      isParent: true,
      isKnown: true
    });
  }
  
  // 2. Explicit referencia field
  if(ref && ref !== '—' && !isSelfReference(ref)){
    const normRef = normalize_doc_key(ref);
    const otherCarta = (ALL_CARTAS || []).find(x => x.id !== c.id && normalize_doc_key(x.n_documento) === normRef);
    if(!rawParts.some(p => normalize_doc_key(p.text) === normRef)){
      rawParts.push({
        text: otherCarta ? otherCarta.n_documento : ref,
        cartaId: otherCarta ? otherCarta.id : null,
        isKnown: !!otherCarta
      });
    }
  }
  
  // 3. Parsed referencias antecedentes / links
  if(rawRefs && rawRefs !== '—'){
    const rawList = rawRefs.includes('\n') ? rawRefs.split('\n') : (typeof parseReferenciasAntecedentes === 'function' ? parseReferenciasAntecedentes(rawRefs) : [rawRefs]);
    rawList.forEach(rawItem => {
      const item = String(rawItem || '').trim();
      if(!item || isSelfReference(item)) return;
      
      const isUrl = /^https?:\/\//i.test(item) || /^(drive\.google|docs\.google|onedrive|sharepoint)/i.test(item);
      if(isUrl){
        if(!rawParts.some(p => p.isUrl && p.text === item)){
          rawParts.push({ text: item, isUrl: true });
        }
      } else {
        const normP = normalize_doc_key(item);
        if(normP && normP !== currentDocNorm && !rawParts.some(existing => !existing.isUrl && normalize_doc_key(existing.text) === normP)){
          const otherCarta = (ALL_CARTAS || []).find(x => x.id !== c.id && normalize_doc_key(x.n_documento) === normP);
          if(otherCarta){
            const otherDt = parseDate(otherCarta.fecha)?.getTime() || 0;
            if(!currentDt || !otherDt || otherDt <= currentDt || otherCarta.id < c.id){
              rawParts.push({
                text: otherCarta.n_documento,
                cartaId: otherCarta.id,
                isKnown: true
              });
            }
          } else {
            rawParts.push({ text: item, isKnown: false });
          }
        }
      }
    });
  }
  
  // Prioritize: (1) Parent & Known Cartas in system, (2) URLs / Links, (3) Other text items
  rawParts.sort((a, b) => {
    const scoreA = a.isParent ? 3 : (a.isKnown ? 2 : (a.isUrl ? 1 : 0));
    const scoreB = b.isParent ? 3 : (b.isKnown ? 2 : (b.isUrl ? 1 : 0));
    return scoreB - scoreA;
  });
  
  if(!rawParts.length && chain.length <= 1){
    return '<span style="color:var(--text-muted)">—</span>';
  }
  
  let html = '';
  if(rawParts.length){
    const shown = rawParts.slice(0, 2);
    html += shown.map(it => {
      if(it.isUrl){
        let url = it.text;
        if(!url.startsWith('http')) url = 'https://' + url;
        const isDrive = url.includes('drive.google') || url.includes('docs.google');
        const isOneDrive = url.includes('onedrive') || url.includes('sharepoint');
        const icon = isDrive ? 'ri-google-drive-fill' : (isOneDrive ? 'ri-microsoft-fill' : 'ri-link');
        const label = isDrive ? 'Drive' : (isOneDrive ? 'OneDrive' : 'Link');
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="ref-link-chip" style="background:#EBF3FA;color:#185A9D;border-color:#B8D3EE" title="Abrir enlace: ${escapeHtml(url)}"><i class="${icon}" style="font-size:10px"></i> ${label}</a>`;
      }
      const cleanP = escapeHtml(cleanSpaces(it.text));
      if(it.isKnown || it.cartaId){
        const cid = it.cartaId || (ALL_CARTAS || []).find(x => normalize_doc_key(x.n_documento) === normalize_doc_key(it.text))?.id;
        const clickAction = cid ? `previewRefCarta(${cid})` : `previewRefCartaDoc('${escapeHtml(it.text)}', event)`;
        return `<a href="javascript:void(0)" class="ref-link-chip" onclick="${clickAction}; if(event) { event.stopPropagation(); event.preventDefault(); }" title="Ver carta citada: ${cleanP}"><i class="ri-git-commit-line" style="font-size:10px"></i> ${cleanP}</a>`;
      }
      return `<span class="ref-plain-text" title="${cleanP}"><i class="ri-git-commit-line" style="color:var(--text-muted);font-size:10px"></i> ${cleanP}</span>`;
    }).join(' ');
    
    if(rawParts.length > 2){
      html += ` <span style="font-size:10px;color:var(--text-muted);font-weight:600" title="${rawParts.length - 2} referencias más">+${rawParts.length - 2}</span>`;
    }
  }
  
  if(chain.length > 1){
    html += `<div style="margin-top:3px"><span class="hilo-counter-badge" onclick="filterByHiloCustom(${c.id}, event)" title="Trámite con ${chain.length} cartas vinculadas. Clic para ver hilo"><i class="ri-git-merge-line"></i> Trámite (${chain.length})</span></div>`;
  }
  
  return `<div class="cell-wrap" style="line-height:1.35">${html}</div>`;
}

function previewRefCartaDoc(docName, event){
  if(event){
    event.stopPropagation();
    event.preventDefault();
  }
  if(!docName) return;
  const norm = normalize_doc_key(docName);
  const c = (ALL_CARTAS || []).find(x => normalize_doc_key(x.n_documento) === norm);
  if(c){
    previewRefCarta(c.id);
  } else {
    showToast(`Documento citado: ${docName}`, 'info');
  }
}

let activeHiloFilter = null;

function filterByHiloCustom(cartaId, event){
  if(event){
    event.stopPropagation();
    event.preventDefault();
  }
  const c = (ALL_CARTAS || []).find(x => x.id === cartaId);
  if(!c) return;
  const chain = getHiloChainCartas(c);
  if(!chain.length) return;

  activeHiloFilter = {
    carta_id: c.id,
    hilo_id: c.hilo_id || null,
    title: c.n_documento || (`Trámite #${c.hilo_id || c.id}`)
  };

  const tableQ = document.getElementById('cartasTableQ');
  if(tableQ) tableQ.value = '';
  const fQ = document.getElementById('filterQ');
  if(fQ) fQ.value = '';

  applyFilters();
  showToast(`Mostrando los ${filtered.length} registros del trámite`, 'info');
}

function clearActiveHiloFilter(e){
  if(e){
    e.stopPropagation();
    e.preventDefault();
  }
  activeHiloFilter = null;
  applyFilters();
}

function getCartaReferencia(c){
  if(!c) return '';
  const ref = String(c.referencia || '').trim();
  const refs = String(c.referencias || '').trim();
  const parts = [];
  if(ref && ref !== '—') parts.push(ref);
  if(refs && refs !== '—') {
    const items = typeof parseRefStringIntoItems === 'function' ? parseRefStringIntoItems(refs) : [];
    if(items.length){
      items.forEach(it => {
        const d = (it.doc || '').trim();
        if(d && !parts.includes(d)) parts.push(d);
      });
    } else {
      if(!parts.includes(refs)) parts.push(refs);
    }
  }
  return parts.join(', ');
}

function getCartaReferenciaDisplay(c){
  const r = getCartaReferencia(c);
  return r || '—';
}

let PEND_MATRIX_IDS={};

function pendEspKey(c){
  return classif(c).especialidad_norm||c.especialidad_norm||'SIN ESPECIALIDAD';
}

function pendContraparteKey(c){
  return contraparteFromBandeja(c)||classif(c).contraparte||inferContraparteFromCarta(c)||'supervisor';
}

function pendMatrixIdsFor(esp,act){
  const bucket=PEND_MATRIX_IDS[esp];
  if(!bucket)return[];
  if(act==='all'){
    const ids=new Set();
    PEND_CONTRAPARTES.forEach(a=>(bucket[a]||[]).forEach(id=>ids.add(id)));
    return[...ids];
  }
  return bucket[act]||[];
}

function cartaMatchesEsp(c,selectedEsp){
  if(!selectedEsp||selectedEsp==='all')return true;
  const sel=selectedEsp.trim().toUpperCase();
  if(pendEspKey(c).toUpperCase()===sel)return true;
  const list=getCartaEspecialidades(c);
  if(list.some(e=>e===sel))return true;
  if(sel==='MIXTA'&&list.length>1)return true;
  return false;
}

function initFilters(){
  const espSet=new Set(),estSet=new Set();
  ALL_CARTAS.forEach(c=>{
    if(c.estado_norm)estSet.add(c.estado_norm);
    getCartaEspecialidades(c).forEach(e=>{if(e&&e!=='SIN ESPECIALIDAD')espSet.add(e);});
  });
  const selE=document.getElementById('filterEstado');
  const prevEst=selE?.value||'all';
  while(selE.options.length>1)selE.remove(1);
  [...estSet].sort().forEach(e=>{const o=document.createElement('option');o.value=e;o.textContent=e;selE.appendChild(o);});
  if(prevEst==='all'){
    selE.value='all';
  }else if([...selE.options].some(o=>o.value===prevEst)){
    selE.value=prevEst;
  }else{
    selE.value='all';
  }
  const selEsp=document.getElementById('filterEsp');
  const prevEsp=selEsp?.value||'all';
  while(selEsp.options.length>1)selEsp.remove(1);
  [...espSet].sort().forEach(e=>{const o=document.createElement('option');o.value=e;o.textContent=e;selEsp.appendChild(o);});
  if(prevEsp!=='all'&&[...selEsp.options].some(o=>o.value===prevEsp))selEsp.value=prevEsp;
}

const ESP_TO_AREA={
  'ESTRUCTURAS':'ESPECIALISTA ESTRUCTURAS','ARQUITECTURA':'ESPECIALISTA ARQUITECTURA','INST. SANITARIAS':'ESPECIALISTA SANITARIAS',
  'INST. ELECTRICAS':'ESPECIALISTA ELECTRICAS','INST. MECANICAS':'EQUIPAMIENTO','EQUIPAMIENTO':'EQUIPAMIENTO',
  'CALIDAD':'SSOMA / CALIDAD','SSOMA':'SSOMA / CALIDAD','GEOTECNIA':'ESPECIALISTA GEOTECNIA','BIM':'ESPECIALISTA BIM',
  'TOPOGRAFIA':'ESPECIALISTA TOPOGRAFIA','MEDIO AMBIENTE':'ESPECIALISTA MEDIO AMBIENTE','ADM. DE CONTRATOS':'ESPECIALISTA ADM. CONTRATOS',
  'COSTOS':'ESPECIALISTA COSTOS','COMUNICACIONES':'ESPECIALISTA COMUNICACIONES','PRODUCCION':'ESPECIALISTA PRODUCCION',
  'RR.HH.':'RESIDENCIA','CAMPO':'ESPECIALISTA CAMPO','MIXTA':'OFICINA TECNICA'
};

function inferAreaFromEspecialidad(c){
  const ban=String(c.bandeja||'');
  if(!ban.startsWith('recibida'))return '';
  const esps=getCartaEspecialidades(c).filter(e=>e!=='SIN ESPECIALIDAD'&&e!=='MIXTA');
  if(!esps.length)return 'RESIDENCIA';
  if(esps.length===1)return ESP_TO_AREA[esps[0]]||esps[0];
  const mapped=[...new Set(esps.map(e=>ESP_TO_AREA[e]).filter(Boolean))];
  if(mapped.length===1)return mapped[0];
  for(const e of esps){
    const t=ESP_TO_AREA[e];
    if(t&&t!=='OFICINA TECNICA')return t;
  }
  return 'OFICINA TECNICA';
}

function quienEnviaLabel(c){
  const ban=String(c.bandeja||'').trim();
  const sentido=c.sentido||(ban.startsWith('recibida')?'recibida':'emitida');
  if(sentido==='emitida'||ban==='residente'||ban==='rl'){
    return c.receptor || (ban==='rl'?'Representante Legal (RL)':'Residente (RO)');
  }
  return c.receptor || (ban==='recibida_sup'?'Supervisión':(ban==='recibida_pronis'?'PRONIS':(ban==='recibida_mpsc'?'Municipalidad':'Entidad Externa')));
}

function quienRecibeLabel(c){
  const ban=String(c.bandeja||'').trim();
  const sentido=c.sentido||(ban.startsWith('recibida')?'recibida':'emitida');
  if(c.dirigido_a) return c.dirigido_a;
  if(sentido==='recibida'){
    return ban==='recibida_pronis'||ban==='recibida_otros'?'Representante Legal (RL)':'Residente (RO)';
  }
  return 'Supervisión';
}

function cleanSpaces(str){
  if(!str) return '';
  return String(str).replace(/\s+/g, ' ').trim();
}

function getEspecialidadDisplay(c){
  const ban = String(c.bandeja || '').trim();
  const isSup = ban === 'recibida_sup' || String(c.receptor || '').toUpperCase().includes('SUPERVIS');
  const raw = String(c.especialidad || c.especialidad_norm || '').trim();
  if(isSup && (!raw || raw === 'SIN ESPECIALIDAD' || raw === 'GENERAL' || raw === 'MIXTA')) {
    return '—';
  }
  if(!raw || raw === '—') return '—';
  const parts = splitEspecialidades(raw).map(p => normalizeEspecialidadJs(p) || cleanSpaces(p));
  const uniqueParts = [...new Set(parts.filter(p => p && p !== 'SIN ESPECIALIDAD' && p !== 'MIXTA'))];
  if(uniqueParts.length){
    return uniqueParts.join(', ');
  }
  return cleanSpaces(c.especialidad_norm || raw) || '—';
}

function formatEspecialidadBadge(c){
  const txt = getEspecialidadDisplay(c);
  if(!txt || txt === '—') return '<span style="color:var(--text-muted)">—</span>';
  const norm = txt.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let cls = 'general';
  if(norm.includes('estruct') || norm.includes('geotec')) cls = 'estructuras';
  else if(norm.includes('arquit') || norm.includes('calidad')) cls = 'arquitectura';
  else if(norm.includes('sanitar') || norm.includes('electr') || norm.includes('electromecan')) cls = 'sanitarias';
  else if(norm.includes('segurid') || norm.includes('ssoma')) cls = 'seguridad';
  else if(norm.includes('legal') || norm.includes('admin')) cls = 'legal';
  else if(norm.includes('mixta')) cls = 'mixta';
  return `<span class="esp-tag ${cls}" title="Especialidad: ${escapeHtml(txt)}"><i class="ri-folder-2-line" style="font-size:10px;opacity:0.8"></i> ${escapeHtml(txt)}</span>`;
}

function formatActorBadge(actorStr){
  const str = String(actorStr || '').trim();
  if(!str || str === '—') return '<span style="color:var(--text-muted)">—</span>';
  const u = str.toUpperCase();
  let cls = '';
  let shortLabel = str;
  if(u === 'RESIDENTE (RO)' || u === 'RESIDENTE' || u === 'RO' || u.includes('CONTRATISTA')) {
    cls = 'ro';
    shortLabel = 'Residente (RO)';
  } else if(u === 'SUPERVISIÓN' || u === 'SUPERVISION' || u === 'SUPERVISOR' || u.includes('SUPERVISIÓN') || u.includes('SUPERVISION')) {
    cls = 'sup';
    shortLabel = 'Supervisión';
  } else if(u === 'PRONIS' || u === 'MINSA' || u.includes('PRONIS')) {
    cls = 'ent';
    shortLabel = 'PRONIS';
  } else if(u === 'MUNICIPALIDAD' || u === 'MPSC' || u.includes('MUNICIPALIDAD')) {
    cls = 'muni';
    shortLabel = 'Municipalidad';
  }
  
  if(cls && shortLabel.length <= 22){
    return `<span class="actor-badge-mini ${cls}" title="${escapeHtml(str)}">${escapeHtml(shortLabel)}</span>`;
  }
  return `<span class="actor-custom-text" title="${escapeHtml(str)}">${escapeHtml(str)}</span>`;
}

async function copyDocToClipboard(text, btn, event){
  if(event){
    if(event.stopPropagation) event.stopPropagation();
    if(event.preventDefault) event.preventDefault();
  }
  if(!text) return;
  try {
    if(navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    if(btn){
      btn.classList.add('copied');
      btn.innerHTML = '<i class="ri-check-line"></i>';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<i class="ri-file-copy-line"></i>';
      }, 1500);
    }
    showToast('N° de carta copiado: ' + text, 'success', 2200);
  } catch(e) {
    showToast('No se pudo copiar el texto', 'warning', 2000);
  }
}

function yoDeboResponderLabel(c){
  const area=String(c.area||'').trim();
  if(area)return area;
  const inferred=inferAreaFromEspecialidad(c);
  if(inferred)return inferred;
  const en=String(c.especialidad_norm||c.especialidad||'').trim();
  if(en&&en!=='SIN ESPECIALIDAD'&&en!=='MIXTA')return en;
  return 'Sin asignar';
}

function getRespRespuestaLabel(c){
  const cl=classif(c);
  const isOut=c.sentido==='emitida'||String(c.bandeja||'').startsWith('emitida')||c.bandeja==='residente'||c.bandeja==='rl';
  if(isOut){
    const destName=cl.contraparte_label||(cl.dest_code==='SUP'?'Supervisión':(cl.dest_code==='PRONIS'?'PRONIS':(cl.dest_code==='MUNI'?'Municipalidad':'Entidad Externa')));
    return `<span class="badge-soft" style="font-size:11px;font-weight:600;background:rgba(196,91,62,.08);color:var(--accent)" title="Respuesta formal a cargo de la entidad externa">🏛️ ${escapeHtml(destName)}</span>`;
  }else{
    const label=yoDeboResponderLabel(c);
    const assigned=label!=='Sin asignar';
    return `<span class="badge-soft" style="font-size:11px;font-weight:700;background:rgba(42,122,120,.08);color:var(--teal)" title="Especialista interno de Residencia que debe elaborar la respuesta">${assigned?'👷':'⚠️'} ${escapeHtml(label)}</span>`;
  }
}

function flujoBadge(c){
  const cl=classif(c);
  const emisor=cl.emisor_code||(c.sentido==='recibida'?'SUP':'RO');
  const dest=cl.dest_code||(c.sentido==='recibida'?'RO':'SUP');
  const isOut=c.sentido==='emitida'||String(c.bandeja||'').startsWith('emitida');
  const tagCls=isOut?'flujo-out':'flujo-in';
  return `<span class="flujo-badge ${tagCls}" title="De ${emisor} hacia ${dest}">
    <span class="flujo-emisor">${emisor}</span>
    <i class="ri-arrow-right-line" style="font-size:10px;opacity:0.7"></i>
    <span class="flujo-dest">${dest}</span>
  </span>`;
}

function normalizeSearchText(str){
  return String(str||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/n[°º.]/g, '')
    .replace(/[\/\-_.,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize_doc_key(raw){
  if(!raw) return '';
  return String(raw)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/N[°º]/gi, 'N ')
    .replace(/\./g, '')
    .replace(/[\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getCartaSearchRelevance(c, q, normQ){
  if(!q) return 0;
  const doc = String(c.n_documento || '').trim();
  const normDoc = normalize_doc_key(doc);
  const normQuery = normalize_doc_key(q);
  
  // 1. Coincidencia exacta en N° de documento (Prioridad Máxima #1)
  if(normDoc && normQuery && normDoc === normQuery) return 100000;
  
  // 2. N° de documento empieza exactamente con la búsqueda
  if(normDoc && normQuery && normDoc.startsWith(normQuery)) return 50000;
  
  // 3. N° de documento contiene la búsqueda completa
  if(normDoc && normQuery && normDoc.includes(normQuery)) return 30000;
  
  // 4. Búsqueda directa sin normalizar en el doc
  const lowDoc = doc.toLowerCase();
  if(lowDoc.includes(q)) return 20000;
  
  // 5. Carta padre (referencia directa) coincide exactamente
  const ref = String(c.referencia || '').trim();
  if(ref){
    const normRef = normalize_doc_key(ref);
    if(normRef === normQuery) return 10000;
    if(normRef.includes(normQuery)) return 8000;
  }
  
  // 6. Referencias adicionales contienen el documento buscado
  const refs = String(c.referencias || '').trim();
  if(refs){
    const normRefs = normalize_doc_key(refs);
    if(normRefs.includes(normQuery)) return 5000;
  }
  
  // 7. El asunto contiene el término buscado
  const asunto = normalizeSearchText(String(c.asunto || ''));
  if(normQ && asunto.includes(normQ)) return 2000;
  
  return 100;
}

function buildCartaSearchIndex(c){
  const cl=classif(c);
  const rawFields = [
    c.n_documento||'',
    getCartaReferencia(c)||'',
    c.referencia||'',
    c.asunto||'',
    c.referencias||'',
    c.especialidad||'',
    c.especialidad_norm||'',
    ...(getCartaEspecialidades(c)),
    c.area||'',
    c.dirigido_a||'',
    c.receptor||'',
    c.cargo||'',
    c.remitente||'',
    c.estado_norm||'',
    c.estado||'',
    c.observacion||'',
    c.observaciones||'',
    c.fecha||'',
    fmtDate(c.fecha)||'',
    c.fecha_recepcion||'',
    fmtDate(c.fecha_recepcion)||'',
    cl.emisor_code||'',
    cl.dest_code||'',
    cl.flujo_code||'',
    cl.flujo_label||'',
    bandejaLabel(c.bandeja)
  ];
  const blob = rawFields.join(' ').toLowerCase();
  c._searchBlob = blob;
  c._searchNorm = normalizeSearchText(blob);
}

function prepareCartasSearchCache(cartas){
  if(!Array.isArray(cartas))return;
  for(let i=0;i<cartas.length;i++){
    buildCartaSearchIndex(cartas[i]);
  }
}

function cartaMatchesSearch(c,q){
  if(!q)return true;
  if(!c._searchNorm){
    buildCartaSearchIndex(c);
  }

  // 1. Fast match exacto
  if(c._searchBlob && c._searchBlob.includes(q))return true;

  // 2. Normalización de tildes y caracteres
  const normQ = normalizeSearchText(q);
  if(!normQ)return true;
  if(c._searchNorm.includes(normQ))return true;

  // 3. Multi-palabra (AND): todas las palabras deben coincidir
  const words = normQ.split(' ').filter(Boolean);
  if(words.length<=1)return false;

  for(let i=0;i<words.length;i++){
    const w=words[i];
    if(/^\d+$/.test(w)){
      const num=parseInt(w,10);
      const reg=new RegExp(`\\b0*${num}\\b`);
      if(!reg.test(c._searchNorm))return false;
    }else if(!c._searchNorm.includes(w)){
      return false;
    }
  }
  return true;
}

function syncCartasSearchUI(explicitVal){
  const tableQ = document.getElementById('cartasTableQ');
  const fQ = document.getElementById('filterQ');
  const q = explicitVal !== undefined ? explicitVal : (tableQ?.value ?? fQ?.value ?? '');
  if(tableQ && tableQ.value !== q) tableQ.value = q;
  if(fQ && fQ.value !== q) fQ.value = q;
  const clr = document.getElementById('cartasTableQClear');
  if(clr) clr.classList.toggle('visible', !!q.trim() || !!activeHiloFilter);
  const term = q.trim();
  const hint = document.getElementById('cartasSearchHint');
  if(hint){
    if(activeHiloFilter){
      hint.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-light);color:var(--accent);padding:3px 10px;border-radius:6px;font-weight:700;font-size:12px"><i class="ri-git-merge-line"></i> Trámite: ${escapeHtml(activeHiloFilter.title)} (${filtered.length} cartas) <button type="button" onclick="clearActiveHiloFilter(event)" style="border:none;background:rgba(196,91,62,0.15);color:var(--accent);cursor:pointer;font-weight:bold;padding:1px 6px;border-radius:4px;margin-left:4px">✕ Ver todas</button></span>`;
    } else if(term && currentView === 'cartas'){
      hint.textContent = `${filtered.length} resultado${filtered.length === 1 ? '' : 's'} para “${term}”`;
    } else {
      hint.textContent = '';
    }
  }
}

function updateFloatingSearchOnScroll(){
  const floatWrap = document.getElementById('filterSearchWrap');
  if(!floatWrap) return;
  
  if(currentView !== 'cartas'){
    floatWrap.classList.remove('floating');
    return;
  }

  const tableQ = document.getElementById('cartasTableQ');
  const filterBar = document.getElementById('filterBar');
  if(!tableQ || !filterBar){
    floatWrap.classList.remove('floating');
    return;
  }

  const tRect = tableQ.getBoundingClientRect();
  const fRect = filterBar.getBoundingClientRect();
  const isScrolledPast = tRect.bottom < fRect.bottom;
  
  floatWrap.classList.toggle('floating', isScrolledPast);
}

function setupCartasSearchFloat(){
  syncCartasSearchUI();
  updateFloatingSearchOnScroll();
}

function setCartasSearchQuery(value){
  const v = value || '';
  const tableQ = document.getElementById('cartasTableQ');
  const fQ = document.getElementById('filterQ');
  if(tableQ) tableQ.value = v;
  if(fQ) fQ.value = v;
  syncCartasSearchUI(v);
  clearTimeout(qTimer);
  qTimer = setTimeout(applyFilters, v.trim() ? 180 : 0);
}

function applyFilters(keepPage = false){
  const bandeja=document.getElementById('filterBandeja')?.value||activeBandeja||'all';
  activeBandeja=bandeja;
  const estado=document.getElementById('filterEstado')?.value||'all';
  const esp=document.getElementById('filterEsp')?.value||'all';
  const semantica=document.getElementById('filterSemantica')?.value||'all';
  const flujo=document.getElementById('filterFlujo')?.value||'all';
  const q=(document.getElementById('cartasTableQ')?.value||document.getElementById('filterQ')?.value||'').trim().toLowerCase();
  const plazo=document.getElementById('filterPlazo')?.value||'all';
  const deuda=document.getElementById('filterDeuda')?.value||'all';
  const contraparte=document.getElementById('filterContraparte')?.value||'all';
  const naturaleza=document.getElementById('filterNaturaleza')?.value||'all';

  if(activeHiloFilter){
    let hiloCartas = [];
    if(activeHiloFilter.hilo_id){
      hiloCartas = ALL_CARTAS.filter(c => c.hilo_id === activeHiloFilter.hilo_id);
    }
    if(!hiloCartas.length && activeHiloFilter.carta_id){
      const refCarta = ALL_CARTAS.find(c => c.id === activeHiloFilter.carta_id);
      if(refCarta){
        hiloCartas = getHiloChainCartas(refCarta);
      }
    }
    if(!hiloCartas.length && activeHiloFilter.carta_ids){
      hiloCartas = ALL_CARTAS.filter(c => activeHiloFilter.carta_ids.has(c.id));
    }
    
    if(hiloCartas.length && !activeHiloFilter.hilo_id){
      const foundHid = hiloCartas.find(x => x.hilo_id)?.hilo_id;
      if(foundHid) activeHiloFilter.hilo_id = foundHid;
    }

    const ids = new Set(hiloCartas.map(x => x.id));
    filtered = ALL_CARTAS.filter(c => ids.has(c.id));
    filtered.sort((a, b) => {
      const fa = String(a.fecha || '');
      const fb = String(b.fecha || '');
      if(fa !== fb) return fa.localeCompare(fb);
      return (a.id || 0) - (b.id || 0);
    });
  } else {
    filtered=ALL_CARTAS.filter(c=>{
      const cl=classif(c);
      if(bandeja!=='all'&&c.bandeja!==bandeja)return false;
      if(estado!=='all'){
        const en=String(c.estado_norm||c.estado||'').trim().toUpperCase();
        if(en!==estado)return false;
      }
      if(esp!=='all'&&!cartaMatchesEsp(c,esp))return false;
      if(semantica!=='all'){
        const sem=analyzeSemanticIntent(c);
        if(sem.categoria!==semantica)return false;
      }
      if(!cartaMatchesFlujo(c,flujo))return false;
      if(q&&!cartaMatchesSearch(c,q))return false;
      if(!matchesPlazo(c,plazo))return false;
      if(deuda!=='all'){
        if(deuda==='ninguna'){
          if(cl.deuda&&cl.deuda!=='ninguna')return false;
        }else if(cl.deuda!==deuda)return false;
      }
      if(contraparte!=='all'&&!cartaMatchesContraparte(c,contraparte))return false;
      if(naturaleza!=='all'&&cartaNaturaleza(cl)!==naturaleza)return false;
      return true;
    });
    const normQ = q ? normalizeSearchText(q) : '';

    filtered.sort((a,b)=>{
      if(q){
        const relA = getCartaSearchRelevance(a, q, normQ);
        const relB = getCartaSearchRelevance(b, q, normQ);
        if(relA !== relB) return relB - relA; // Mayor relevancia primero
      }
      const sa=deadlineStatus(a),sb=deadlineStatus(b);
      const ra=plazoRank(sa.kind),rb=plazoRank(sb.kind);
      if(ra!==rb)return ra-rb;
      if(sa.days!=null&&sb.days!=null&&ra<=1)return sa.days-sb.days;
      const fa=parseDate(a.fecha),fb=parseDate(b.fecha);
      if(fa&&fb&&fa.getTime()!==fb.getTime())return fb-fa;
      return(b.id||0)-(a.id||0);
    });
  }

  const has=!!activeHiloFilter||estado!=='all'||esp!=='all'||semantica!=='all'||flujo!=='all'||q||plazo!=='all'||bandeja!=='all'||deuda!=='all'||contraparte!=='all'||naturaleza!=='all';
  document.getElementById('btnReset')?.classList.toggle('visible',has);
  document.getElementById('filterActiveTag')?.classList.toggle('visible',has);
  if(!keepPage){
    currentPage=1;
  } else {
    currentPage = Math.min(Math.max(1, currentPage), totalPages());
  }
  updateAll();
  syncCartasSearchUI();
  if(!filtered.length&&has&&ALL_CARTAS.length){
    const hint=document.getElementById('cartasSearchHint');
    if(hint&&currentView==='cartas')hint.textContent='0 resultados — prueba quitar Flujo o Deuda, o pulsa Limpiar';
  }
}

function resetFiltersSilent(){
  activeHiloFilter = null;
  const fEst=document.getElementById('filterEstado'); if(fEst)fEst.value='all';
  const fEsp=document.getElementById('filterEsp'); if(fEsp)fEsp.value='all';
  const fSem=document.getElementById('filterSemantica'); if(fSem)fSem.value='all';
  const fFlujo=document.getElementById('filterFlujo'); if(fFlujo)fFlujo.value='all';
  const tableQ=document.getElementById('cartasTableQ'); if(tableQ)tableQ.value='';
  const fQ=document.getElementById('filterQ'); if(fQ)fQ.value='';
  const fPlazo=document.getElementById('filterPlazo'); if(fPlazo)fPlazo.value='all';
  const fDeuda=document.getElementById('filterDeuda'); if(fDeuda)fDeuda.value='all';
  const fContra=document.getElementById('filterContraparte'); if(fContra)fContra.value='all';
  const fNat=document.getElementById('filterNaturaleza'); if(fNat)fNat.value='all';
  const fBan=document.getElementById('filterBandeja'); if(fBan)fBan.value='all';
  activeBandeja='all';
  syncCartasSearchUI('');
}

function resetFilters(){
  resetFiltersSilent();
  initBandejas();
  applyFilters();
}

function applyPlazosConfig(stats){
  const p=(stats&&stats.plazos)||{};
  if(p.vencida_dias!=null)VENCIDA_DIAS=Number(p.vencida_dias)||VENCIDA_DIAS;
  if(p.por_vencer_dias!=null)POR_VENCER_DIAS=Number(p.por_vencer_dias)||POR_VENCER_DIAS;
  if(stats&&stats.plazos_contractuales){
    applyPlazoContractualConfig(stats.plazos_contractuales);
  }else if(stats&&stats.plazos_respuesta){
    const pr=stats.plazos_respuesta;
    applyPlazoContractualConfig({
      plazo_sup_dias:pr.supervisor&&pr.supervisor.dias,
      plazo_entidad_dias:pr.entidad&&pr.entidad.dias,
      plazo_muni_dias:pr.municipalidad&&pr.municipalidad.dias,
      plazo_jrd_dias:pr.jrd&&pr.jrd.dias,
      plazo_ro_dias:(pr.residente&&pr.residente.dias)||(pr.supervisor&&pr.supervisor.dias)
    });
  }
  const fv=document.getElementById('footerVencida');
  const fr=document.getElementById('footerRiesgo');
  if(fv)fv.textContent=String(VENCIDA_DIAS);
  if(fr)fr.textContent=String(POR_VENCER_DIAS);
  const ov=document.getElementById('optPlazoVencida');
  const or_=document.getElementById('optPlazoRiesgo');
  const ok=document.getElementById('optPlazoOk');
  if(ov)ov.textContent=`Vencidas (≥${VENCIDA_DIAS}d abiertas)`;
  if(or_)or_.textContent=`Por vencer (≥${POR_VENCER_DIAS}d)`;
  if(ok)ok.textContent=`En gestión (<${POR_VENCER_DIAS}d)`;
}

function updateHeroMeta(){
  document.getElementById('heroCount').textContent=ALL_CARTAS.length;
  document.getElementById('heroEsp').textContent=new Set(ALL_CARTAS.map(c=>c.especialidad_norm||'SIN ESPECIALIDAD')).size;
  document.getElementById('heroBandejas').textContent=new Set(ALL_CARTAS.map(c=>c.bandeja).filter(Boolean)).size;
  const ds=new Date().toLocaleDateString('es-PE',{day:'2-digit',month:'long',year:'numeric'});
  document.getElementById('heroDate').textContent=ds;
  document.getElementById('footerDate').textContent=ds;
}

function countPlazos(list){
  const c={vencida:0,por_vencer:0,ok:0,cerrada:0,sin_plazo:0,abiertas:0};
  list.forEach(x=>{const st=deadlineStatus(x);c[st.kind]=(c[st.kind]||0)+1;if(st.open)c.abiertas++;});
  return c;
}

function renderDeadlineStats(id,counts){
  document.getElementById(id).innerHTML=`
    <div class="deadline-stat danger"><div class="n">${counts.vencida}</div><div class="l">Vencidas</div></div>
    <div class="deadline-stat warning"><div class="n">${counts.por_vencer}</div><div class="l">Por vencer</div></div>
    <div class="deadline-stat info"><div class="n">${counts.ok}</div><div class="l">En gestión</div></div>`;
}

function updateDeadlineAlerts(){
  const counts=countPlazos(filtered);
  let tone='tone-ok',title='Plazos bajo control',text=`De ${filtered.length} cartas en el alcance, no hay abiertas vencidas ni en riesgo (≥${POR_VENCER_DIAS} días).`;
  if(!filtered.length){
    tone='tone-ok';
    title='Sin cartas';
    text='No hay documentos con los filtros seleccionados.';
  }else if(counts.vencida>0){
    tone='tone-danger';
    title='Hay cartas vencidas';
    text=`${counts.vencida} abierta${counts.vencida===1?'':'s'} superan ${VENCIDA_DIAS} días desde la fecha del documento (${counts.por_vencer} en ventana de riesgo ${POR_VENCER_DIAS}–${VENCIDA_DIAS-1}d). El backlog histórico suele concentrarse en “vencidas”.`;
  }else if(counts.por_vencer>0){
    tone='tone-warning';
    title='Cartas por vencer';
    text=`${counts.por_vencer} carta${counts.por_vencer===1?'':'s'} abierta${counts.por_vencer===1?'':'s'} con ≥${POR_VENCER_DIAS} días sin cerrar.`;
  }
  const inner=document.getElementById('deadlineAlertInnerReportes');
  if(inner){
    inner.className='deadline-alert-inner '+tone;
    document.getElementById('deadlineTitleReportes').textContent=title;
    document.getElementById('deadlineTextReportes').textContent=text;
    renderDeadlineStats('deadlineStatsReportes',counts);
  }
}

