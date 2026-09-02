function setupCartaPadreSearch(){
  if(cartaPadreSearchInitialized) return;
  cartaPadreSearchInitialized = true;

  const searchInput = document.getElementById('cartaPadreSearchInput');
  const suggestBox = document.getElementById('cartaPadreSuggest');
  const removeBtn = document.getElementById('btnRemoveCartaPadre');
  const emisorSel = document.getElementById('f_emisor');
  const destSel = document.getElementById('f_destinatario');
  const estadoSel = document.getElementById('f_estado');
  const reqCheck = document.getElementById('f_requiere_respuesta');

  emisorSel?.addEventListener('change', () => updateDestinatarioOptions());
  destSel?.addEventListener('change', () => {
    if(document.getElementById('f_plazo_dias')) document.getElementById('f_plazo_dias').dataset.auto = '1';
    updatePlazoFromActors();
  });
  estadoSel?.addEventListener('change', (e) => {
    const v = e.target.value;
    const isClosed = isClosedState(v) || v === 'PARA CONOCIMIENTO';
    
    // Check if intermediate letter in thread
    const currentCarta = editingId ? (ALL_CARTAS||[]).find(x => x.id === editingId) : null;
    const chain = currentCarta && typeof getHiloChainCartas === 'function' ? getHiloChainCartas(currentCarta) : [];
    const currentIdx = currentCarta ? chain.findIndex(x => x.id === currentCarta.id) : -1;
    const hasSuccessors = currentIdx !== -1 && currentIdx < chain.length - 1;
    
    if(hasSuccessors){
      setCategoriaCartaMode('successors', { numSuccessors: chain.length - 1 - currentIdx });
      updatePlazoFromActors();
      return;
    }
    
    if(isClosed){
      setCategoriaCartaMode('closed', { estado: v });
    } else {
      setCategoriaCartaMode('editable');
      if(reqCheck) reqCheck.checked = true;
    }
    updatePlazoFromActors();
  });
  reqCheck?.addEventListener('change', () => {
    if(!reqCheck.checked){
      if(estadoSel && !isClosedState(estadoSel.value)){
        estadoSel.value = 'PARA CONOCIMIENTO';
      }
    } else {
      if(estadoSel){
        if(estadoSel.value === 'PARA CONOCIMIENTO' || isClosedState(estadoSel.value) || !estadoSel.value){
          estadoSel.value = 'ABIERTO';
        }
      }
    }
    updatePlazoFromActors();
  });
  const asuntoInput = document.getElementById('f_asunto');
  asuntoInput?.addEventListener('input', () => {
    if(editingId == null && estadoSel){
      const val = (asuntoInput.value || '').toUpperCase();
      if(/\b(PARA\s+CONOCIMIENTO|SOLO\s+INFORMATIVO|PARA\s+FINES\s+DE\s+ARCHIVO)\b/i.test(val)){
        estadoSel.value = 'PARA CONOCIMIENTO';
        if(reqCheck) reqCheck.checked = false;
        updatePlazoFromActors();
      }
    }
  });

  if(searchInput && suggestBox){
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if(!q || q.length < 2){
        suggestBox.style.display = 'none';
        suggestBox.innerHTML = '';
        return;
      }
      const currentDoc = document.getElementById('f_n_documento')?.value?.trim()?.toLowerCase() || '';
      const currentId = editingId;
      const matches = (ALL_CARTAS || []).filter(c => {
        if(currentId && c.id === currentId) return false;
        const doc = String(c.n_documento || '').toLowerCase();
        if(currentDoc && doc === currentDoc) return false;
        const asunto = String(c.asunto || '').toLowerCase();
        const esp = String(c.especialidad || '').toLowerCase();
        return doc.includes(q) || asunto.includes(q) || esp.includes(q);
      }).slice(0, 10);

      if(!matches.length){
        suggestBox.innerHTML = '<div style="padding:10px 14px;color:var(--text-muted);font-size:12px">No se encontraron cartas que coincidan</div>';
        suggestBox.style.display = 'block';
        return;
      }

      suggestBox.innerHTML = matches.map(c => {
        const est = String(c.estado_norm || c.estado || 'ABIERTO').toUpperCase();
        const closed = isClosedState(est);
        const stBadge = closed 
          ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:var(--sage-light);color:var(--sage)">🔒 ${escapeHtml(est)}</span>`
          : `<span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;background:var(--lavender-light);color:var(--lavender)">⚡ EN TRÁMITE</span>`;
        const espDisplay = getEspecialidadDisplay(c);
        const asuntoDisplay = cleanSpaces(c.asunto || 'Sin asunto');
        const docDisplay = cleanSpaces(c.n_documento || 'ID ' + c.id);
        return `
        <div class="carta-padre-item" data-id="${c.id}" style="${closed?'background:#FAFAF9;opacity:0.9':''}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-weight:700;color:var(--text-primary)">${escapeHtml(docDisplay)} <span style="font-size:11px;font-weight:normal;color:var(--text-muted)">(${fmtDate(c.fecha) || 'Sin fecha'})</span></span>
            ${stBadge}
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:550px;margin-top:2px">${escapeHtml(asuntoDisplay)}</div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">${escapeHtml(espDisplay)} · ${escapeHtml(cleanSpaces(quienEnviaLabel(c)))} ➔ ${escapeHtml(cleanSpaces(quienRecibeLabel(c)))}</div>
        </div>`;
      }).join('');
      suggestBox.style.display = 'block';

      suggestBox.querySelectorAll('.carta-padre-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = parseInt(item.dataset.id, 10);
          const carta = ALL_CARTAS.find(x => x.id === id);
          if(carta) selectCartaPadre(carta);
        });
      });
    });

    document.addEventListener('click', (e) => {
      if(!e.target.closest('.carta-padre-widget')){
        suggestBox.style.display = 'none';
      }
    });
  }

  if(removeBtn){
    removeBtn.addEventListener('click', () => clearCartaPadre());
  }
}



function findHiloForCarta(cartaOrId){
  if(!cartaOrId) return null;
  const c = typeof cartaOrId === 'object' ? cartaOrId : (ALL_CARTAS||[]).find(x => x.id === cartaOrId);
  if(!c) return null;

  const docNorm = typeof normalize_doc_key === 'function' ? normalize_doc_key(c.n_documento) : String(c.n_documento||'').trim().toUpperCase();

  if(HILOS && HILOS.hilos){
    for(const h of HILOS.hilos){
      if((h.carta_ids || []).includes(c.id)){
        return h;
      }
      if(docNorm && (h.docs || []).map(d => (typeof normalize_doc_key === 'function' ? normalize_doc_key(d) : String(d||'').trim().toUpperCase())).includes(docNorm)){
        return h;
      }
    }
  }

  if(c.hilo_id){
    const cartasInHilo = (ALL_CARTAS || []).filter(x => x.hilo_id === c.hilo_id);
    if(cartasInHilo.length){
      return {
        hilo_id: c.hilo_id,
        titulo: c.asunto || c.n_documento,
        cartas: cartasInHilo
      };
    }
  }

  const visitedIds = new Set([c.id]);
  const chain = [c];
  let changed = true;
  while(changed){
    changed = false;
    for(const item of (ALL_CARTAS || [])){
      if(visitedIds.has(item.id)) continue;
      const ref = typeof normalize_doc_key === 'function' ? normalize_doc_key(item.referencia) : String(item.referencia||'').trim().toUpperCase();
      const refs = String(item.referencias || '').toUpperCase();
      const doc = typeof normalize_doc_key === 'function' ? normalize_doc_key(item.n_documento) : String(item.n_documento||'').trim().toUpperCase();
      const isLinked = chain.some(ch => {
        const chDoc = typeof normalize_doc_key === 'function' ? normalize_doc_key(ch.n_documento) : String(ch.n_documento||'').trim().toUpperCase();
        const chRef = typeof normalize_doc_key === 'function' ? normalize_doc_key(ch.referencia) : String(ch.referencia||'').trim().toUpperCase();
        const chRefs = String(ch.referencias || '').toUpperCase();
        return (ref && chDoc && ref === chDoc) ||
               (doc && chRef && chRef === doc) ||
               (chDoc && refs.includes(chDoc)) ||
               (doc && chRefs.includes(doc));
      });
      if(isLinked){
        visitedIds.add(item.id);
        chain.push(item);
        changed = true;
      }
    }
  }

  return {
    hilo_id: c.hilo_id || null,
    titulo: c.asunto || c.n_documento,
    cartas: chain
  };
}

function getHiloChainCartas(cartaOrId){
  const hilo = findHiloForCarta(cartaOrId);
  let cartas = [];
  if(hilo){
    if(hilo.carta_ids && hilo.carta_ids.length){
      cartas = hilo.carta_ids.map(id => (ALL_CARTAS||[]).find(x => x.id === id)).filter(Boolean);
    } else if(hilo.cartas && hilo.cartas.length){
      cartas = hilo.cartas;
    }
  }
  if(!cartas.length){
    const c = typeof cartaOrId === 'object' ? cartaOrId : (ALL_CARTAS||[]).find(x => x.id === cartaOrId);
    if(c) cartas = [c];
  }
  cartas.sort((a, b) => {
    const fa = String(a.fecha || '');
    const fb = String(b.fecha || '');
    if(fa !== fb) return fa.localeCompare(fb);
    return (a.id || 0) - (b.id || 0);
  });
  return cartas;
}

function getLatestCartaInHilo(cartaOrId){
  const chain = getHiloChainCartas(cartaOrId);
  return chain.length ? chain[chain.length - 1] : (typeof cartaOrId === 'object' ? cartaOrId : (ALL_CARTAS||[]).find(x => x.id === cartaOrId));
}

function selectCartaPadre(c){
  if(!c) return;
  if(editingId != null && c.id === editingId){
    showToast('Una carta no puede ser su propia carta padre.', 'warning');
    return;
  }
  const latest = getLatestCartaInHilo(c) || c;

  document.getElementById('f_referencia').value = latest.n_documento || '';
  document.getElementById('f_hilo_id').value = latest.hilo_id || latest.id || '';
  
  renderCartaPadreCardUI('', latest, editingId);

  // Solo pre-llenar Tipo de Documento si el formulario no tiene uno definido
  const currentTipo = document.getElementById('f_tipo_documento')?.value?.trim();
  if(latest.tipo_documento && (!currentTipo || currentTipo === 'CARTA')){
    document.getElementById('f_tipo_documento').value = latest.tipo_documento;
  }
  if(latest.especialidad && fSelectedEspecialidades.size === 0){
    populateFormEspChips(latest.especialidad);
  }

  if(editingId == null){
    const sLatest = String(latest.estado_norm || latest.estado || '').trim().toUpperCase();
    if(isClosedState(sLatest)){
      showToast(`Nota: Este trámite (${latest.n_documento}) figura como ${sLatest}.`, 'info');
    }
  }
}

function clearCartaPadre(){
  document.getElementById('f_referencia').value = '';
  document.getElementById('f_hilo_id').value = '';
  document.getElementById('cartaPadreSelectedCard').style.display = 'none';
  document.getElementById('cartaPadreSearchWrap').style.display = 'block';
  document.getElementById('cartaPadreSearchInput').value = '';
  document.getElementById('cartaPadreSuggest').style.display = 'none';
}

const ESP_ALIAS_MAP = {
  'ESTR.': 'ESTRUCTURAS', 'ESTR': 'ESTRUCTURAS', '.ESTR': 'ESTRUCTURAS', 'ESTRUCTURAS': 'ESTRUCTURAS',
  'ARQ.': 'ARQUITECTURA', 'ARQ': 'ARQUITECTURA', 'ARQUI.': 'ARQUITECTURA', 'ARQUITECTURA': 'ARQUITECTURA',
  'INST. ELECTRICAS': 'INST. ELECTRICAS', 'INST. ELÉCTRICAS': 'INST. ELECTRICAS', 'INST. ELECTR.': 'INST. ELECTRICAS', 'II.EE': 'INST. ELECTRICAS', 'IIEE': 'INST. ELECTRICAS', 'INT. ELECTRICAS': 'INST. ELECTRICAS',
  'INST. SANITARIAS': 'INST. SANITARIAS', 'INST. SANITARIAS.': 'INST. SANITARIAS', 'INSTALACIONES SANITARIAS': 'INST. SANITARIAS', 'IISS': 'INST. SANITARIAS',
  'INST. MECANICAS': 'INST. MECANICAS', 'INST. MECÁNICAS': 'INST. MECANICAS', 'INST MECANICAS': 'INST. MECANICAS', 'MECANICA': 'INST. MECANICAS',
  'COMUNICACIONES': 'COMUNICACIONES', 'INST. COMUNICACIONES': 'COMUNICACIONES', 'INST. Y COMUNICACIONES': 'COMUNICACIONES', 'INST Y COMUNICACIONES': 'COMUNICACIONES', 'INST. DE COMUNICACIONES': 'COMUNICACIONES', 'INST. COMUN.': 'COMUNICACIONES',
  'EQUIPAMIENTO': 'EQUIPAMIENTO', 'EQUIPAMEINTO': 'EQUIPAMIENTO', 'EQUIP. MEDICO': 'EQUIPAMIENTO', 'EQUI. MEDICO': 'EQUIPAMIENTO', 'EQUIP.': 'EQUIPAMIENTO', 'EQUI.': 'EQUIPAMIENTO', 'INST. EQUIP. HOSPITALARIO': 'EQUIPAMIENTO',
  'GEOTECNIA': 'GEOTECNIA', 'GEOT.': 'GEOTECNIA', 'ESP. GEOTECNIA': 'GEOTECNIA',
  'COSTOS': 'COSTOS', 'CALIDAD': 'CALIDAD', 'SSOMA': 'SSOMA', 'SOMA': 'SSOMA',
  'MEDIO AMBIENTE': 'MEDIO AMBIENTE', 'ESP. M. AMBIENTE': 'MEDIO AMBIENTE', 'M. AMBIENTE': 'MEDIO AMBIENTE', 'M. AMB': 'MEDIO AMBIENTE',
  'ADM. DE CONTR.': 'ADM. DE CONTRATOS', 'ADM. CONTRATOS': 'ADM. DE CONTRATOS', 'ADM CONTRATOS': 'ADM. DE CONTRATOS', 'ADM DE CONTRATOS': 'ADM. DE CONTRATOS', 'ADMIN DE CONTRATOS': 'ADM. DE CONTRATOS', 'ADMIN. DE CONTRATOS': 'ADM. DE CONTRATOS', 'ADMINIST DE CONTR': 'ADM. DE CONTRATOS', 'ADMINIST DE CONTRATOS': 'ADM. DE CONTRATOS', 'ADM. DE CONTRATOS': 'ADM. DE CONTRATOS',
  'PRODUCCION': 'PRODUCCION', 'PRODUCCIÓN': 'PRODUCCION', 'PROD.': 'PRODUCCION',
  'TOPOGRAFIA': 'TOPOGRAFIA', 'TOPOGRAFÍA': 'TOPOGRAFIA', 'TOP.': 'TOPOGRAFIA',
  'RR.HH.': 'RR.HH.', 'RRHH': 'RR.HH.',
  'OFICINA TECNICA': 'OFICINA TECNICA',
  'CAMPO': 'CAMPO', 'ING. CAMPO': 'CAMPO',
  'BIM': 'BIM', 'SEGURIDAD': 'SSOMA',
  'RESIDENTE': 'RO', 'RESIDENCIA': 'RO', 'WILINTONG DELGADO': 'RO', 'MILER': 'CAMPO'
};

function normalizeEspecialidadJs(raw){
  if(!raw) return '';
  const s = String(raw).trim().toUpperCase();
  if(ESP_ALIAS_MAP[s]) return ESP_ALIAS_MAP[s];
  const clean = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  if(ESP_ALIAS_MAP[clean]) return ESP_ALIAS_MAP[clean];
  for(const [k, v] of Object.entries(ESP_ALIAS_MAP)){
    if(s === k || s.startsWith(k) || k.startsWith(s)) return v;
  }
  return s;
}

let fSelectedEspecialidades = new Set();

function populateFormEspChips(initialValues){
  const container = document.getElementById('f_esp_chips_container');
  if(!container) return;
  
  fSelectedEspecialidades = new Set();
  if(initialValues){
    let rawList = [];
    if(Array.isArray(initialValues)){
      rawList = initialValues;
    } else if(typeof initialValues === 'string'){
      rawList = splitEspecialidades(initialValues);
    }
    rawList.forEach(p => {
      const norm = normalizeEspecialidadJs(p);
      if(norm && norm !== 'SIN ESPECIALIDAD' && norm !== 'MIXTA'){
        fSelectedEspecialidades.add(norm);
      }
    });
  }

  const catalog = [...getCatalogoEspecialidadesForUser()];
  // Si la carta tiene una especialidad (histórica o personalizada como RO) que no está en el catálogo base, incluirla dinámicamente para que se vea seleccionada y con check
  fSelectedEspecialidades.forEach(selectedEsp => {
    const normSel = normalizeEspecialidadJs(selectedEsp);
    const inCatalog = catalog.some(c => normalizeEspecialidadJs(c) === normSel || c.toUpperCase() === normSel);
    if(!inCatalog && normSel && normSel !== 'SIN ESPECIALIDAD' && normSel !== 'MIXTA'){
      catalog.push(selectedEsp);
    }
  });

  container.innerHTML = catalog.map(esp => {
    const normCatalog = normalizeEspecialidadJs(esp);
    const isActive = fSelectedEspecialidades.has(normCatalog) || fSelectedEspecialidades.has(esp.toUpperCase());
    return `<button type="button" class="esp-chip-btn${isActive ? ' active' : ''}" data-esp="${escapeHtml(normCatalog || esp)}">
      <i class="${isActive ? 'ri-checkbox-circle-fill' : 'ri-add-line'}"></i>
      <span>${escapeHtml(esp)}</span>
    </button>`;
  }).join('');

  container.querySelectorAll('.esp-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const esp = normalizeEspecialidadJs(btn.dataset.esp);
      if(fSelectedEspecialidades.has(esp)){
        fSelectedEspecialidades.delete(esp);
        btn.classList.remove('active');
        const icon = btn.querySelector('i');
        if(icon) icon.className = 'ri-add-line';
      } else {
        fSelectedEspecialidades.add(esp);
        btn.classList.add('active');
        const icon = btn.querySelector('i');
        if(icon) icon.className = 'ri-checkbox-circle-fill';
      }
      updateFormEspState();
    });
  });

  updateFormEspState();
}

function updateFormEspState(){
  const countBadge = document.getElementById('f_esp_count_badge');
  const hiddenInput = document.getElementById('f_especialidad');
  const arr = Array.from(fSelectedEspecialidades);
  if(hiddenInput){
    hiddenInput.value = arr.join(', ');
  }
  if(countBadge){
    const n = arr.length;
    countBadge.textContent = n ? `${n} seleccionada${n === 1 ? '' : 's'}` : '0 seleccionadas';
  }
}

let responderParentCarta = null;
let responderSearchInitialized = false;

let rfSelectedEspecialidades = new Set();

function populateResponderEspChips(initialValues){
  const container = document.getElementById('rf_esp_chips_container');
  if(!container) return;
  
  rfSelectedEspecialidades = new Set();
  if(initialValues){
    let rawList = [];
    if(Array.isArray(initialValues)){
      rawList = initialValues;
    } else if(typeof initialValues === 'string'){
      rawList = splitEspecialidades(initialValues);
    }
    rawList.forEach(p => {
      const norm = normalizeEspecialidadJs(p);
      if(norm && norm !== 'SIN ESPECIALIDAD' && norm !== 'MIXTA'){
        rfSelectedEspecialidades.add(norm);
      }
    });
  }

  const catalog = [...getCatalogoEspecialidadesForUser()];
  rfSelectedEspecialidades.forEach(selectedEsp => {
    const normSel = normalizeEspecialidadJs(selectedEsp);
    const inCatalog = catalog.some(c => normalizeEspecialidadJs(c) === normSel || c.toUpperCase() === normSel);
    if(!inCatalog && normSel && normSel !== 'SIN ESPECIALIDAD' && normSel !== 'MIXTA'){
      catalog.push(selectedEsp);
    }
  });

  container.innerHTML = catalog.map(esp => {
    const normCatalog = normalizeEspecialidadJs(esp);
    const isActive = rfSelectedEspecialidades.has(normCatalog) || rfSelectedEspecialidades.has(esp.toUpperCase());
    return `<button type="button" class="esp-chip-btn${isActive ? ' active' : ''}" data-esp="${escapeHtml(normCatalog || esp)}">
      <i class="${isActive ? 'ri-checkbox-circle-fill' : 'ri-add-line'}"></i>
      <span>${escapeHtml(esp)}</span>
    </button>`;
  }).join('');

  container.querySelectorAll('.esp-chip-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const esp = normalizeEspecialidadJs(btn.dataset.esp);
      if(rfSelectedEspecialidades.has(esp)){
        rfSelectedEspecialidades.delete(esp);
        btn.classList.remove('active');
        const icon = btn.querySelector('i');
        if(icon) icon.className = 'ri-add-line';
      } else {
        rfSelectedEspecialidades.add(esp);
        btn.classList.add('active');
        const icon = btn.querySelector('i');
        if(icon) icon.className = 'ri-checkbox-circle-fill';
      }
      updateResponderEspState();
    });
  });

  updateResponderEspState();
}

function updateResponderEspState(){
  const countBadge = document.getElementById('rf_esp_count_badge');
  const hiddenInput = document.getElementById('rf_especialidad');
  const arr = Array.from(rfSelectedEspecialidades);
  if(hiddenInput){
    hiddenInput.value = arr.join(', ');
  }
  if(countBadge){
    const n = arr.length;
    countBadge.textContent = n ? `${n} seleccionada${n === 1 ? '' : 's'}` : '0 seleccionadas';
  }
}

function openResponderModal(parentCartaId){
  if (CURRENT_USER && !CURRENT_USER.can_create_cartas) {
    showToast('Solo el Administrador puede registrar respuestas de cartas.', 'error');
    return;
  }
  let baseCarta = null;
  if(parentCartaId){
    baseCarta = (ALL_CARTAS||[]).find(x => x.id === parentCartaId);
    if(baseCarta){
      const est = String(baseCarta.estado_norm || baseCarta.estado || '').toUpperCase();
      if(isClosedState(est)){
        showToast(`Nota: Este trámite (${baseCarta.n_documento || 'ID '+baseCarta.id}) figura como ${est}. Se abrirá para continuar o reabrir el hilo.`, 'info');
      }
    }
  }
  setupResponderCartaPadreSearch();
  document.getElementById('responderForm').reset();
  populateRefList('', 'rf_referenciasListContainer', 'rf_referencias');
  
  const today = getTodayIso();
  document.getElementById('rf_fecha').value = today;
  const modeCierre = document.getElementById('rf_mode_cierre');
  if(modeCierre){ modeCierre.checked = true; updateResponderTramitePills(); }
  if(document.getElementById('rf_tipo_documento')){
    document.getElementById('rf_tipo_documento').value = baseCarta?.tipo_documento || 'CARTA';
  }

  if(parentCartaId && baseCarta){
    selectResponderCartaPadre(baseCarta);
    
    // Sugerir asunto inteligente según la intención de la carta
    const rfAsunto = document.getElementById('rf_asunto');
    if(rfAsunto && !rfAsunto.value.trim()){
      const sem = analyzeSemanticIntent(baseCarta);
      const cleanDoc = baseCarta.n_documento || '';
      if(sem.categoria === 'ensayo_calidad'){
        rfAsunto.value = `PRONUNCIAMIENTO RESPECTO A ENSAYOS DE CALIDAD (${cleanDoc})`;
      } else if(sem.categoria === 'consulta_rfi'){
        rfAsunto.value = `ABSOLUCIÓN A CONSULTA TÉCNICA (${cleanDoc})`;
      } else if(sem.categoria === 'subsanacion'){
        rfAsunto.value = `VERIFICACIÓN DE SUBSANACIÓN DE OBSERVACIONES (${cleanDoc})`;
      } else if(sem.categoria === 'reiterativo'){
        rfAsunto.value = `ATENCIÓN A REITERATIVO (${cleanDoc})`;
      } else if(baseCarta.asunto){
        rfAsunto.value = `RESPUESTA A ${cleanDoc} — ${baseCarta.asunto.slice(0, 80)}`;
      }
    }
  } else {
    clearResponderCartaPadre();
    populateResponderEspChips([]);
  }

  showResponderModal();
  setTimeout(() => document.getElementById('rf_n_documento')?.focus(), 50);
}

function showResponderModal(){
  const o = document.getElementById('responderModalOverlay');
  if(o){
    o.classList.remove('closing');
    o.classList.add('active');
  }
}

function closeResponderModal(){
  const o = document.getElementById('responderModalOverlay');
  if(!o || !o.classList.contains('active')) return;
  o.classList.add('closing');
  setTimeout(() => {
    o.classList.remove('active', 'closing');
    responderParentCarta = null;
  }, 160);
}

function selectResponderCartaPadre(c){
  const latest = getLatestCartaInHilo(c) || c;
  responderParentCarta = latest;

  document.getElementById('rf_padre_id').value = latest.id || '';
  document.getElementById('rf_padre_doc').value = latest.n_documento || '';
  document.getElementById('rf_hilo_id').value = latest.hilo_id || latest.id || '';

  if(document.getElementById('rf_tipo_documento')){
    document.getElementById('rf_tipo_documento').value = latest.tipo_documento || c.tipo_documento || 'CARTA';
  }

  renderCartaPadreCardUI('rf', latest, c);

  if(latest.especialidad){
    populateResponderEspChips(latest.especialidad);
  } else {
    populateResponderEspChips([]);
  }

  const flujoSel = document.getElementById('rf_flujo');
  if(flujoSel){
    const ban = latest.bandeja || '';
    const dir = String(latest.dirigido_a || '').toUpperCase();
    if(ban === 'residente'){
      flujoSel.value = 'SUP_TO_RO';
    } else if(ban === 'rl'){
      flujoSel.value = dir.includes('PRONIS') ? 'PRONIS_TO_RL' : 'SUP_TO_RL';
    } else if(ban === 'recibida_sup'){
      flujoSel.value = 'RO_TO_SUP';
    } else if(ban === 'recibida_pronis'){
      flujoSel.value = 'RL_TO_PRONIS';
    } else if(ban === 'recibida_mpsc'){
      flujoSel.value = 'MUNI_TO_RO';
    } else if(ban === 'recibida_otros'){
      flujoSel.value = 'JRD_TO_RL';
    }
  }
}

function clearResponderCartaPadre(){
  responderParentCarta = null;
  document.getElementById('rf_padre_id').value = '';
  document.getElementById('rf_padre_doc').value = '';
  document.getElementById('rf_hilo_id').value = '';
  document.getElementById('rf_cartaPadreSelectedCard').style.display = 'none';
  document.getElementById('rf_cartaPadreSearchWrap').style.display = 'block';
  document.getElementById('rf_cartaPadreSearchInput').value = '';
  document.getElementById('rf_cartaPadreSuggest').style.display = 'none';
  populateResponderEspChips([]);
}

function updateResponderTramitePills(){
  const isCierre = document.getElementById('rf_mode_cierre')?.checked;
  const pillCierre = document.getElementById('rf_pill_cierre');
  const pillContinua = document.getElementById('rf_pill_continua');
  if(pillCierre && pillContinua){
    pillCierre.style.borderColor = isCierre ? 'var(--accent)' : 'var(--border)';
    pillCierre.style.background = isCierre ? '#FFF9F7' : '#FAFAF8';
    pillContinua.style.borderColor = !isCierre ? 'var(--accent)' : 'var(--border)';
    pillContinua.style.background = !isCierre ? '#FFF9F7' : '#FAFAF8';
  }
}

function setupResponderCartaPadreSearch(){
  if(responderSearchInitialized) return;
  responderSearchInitialized = true;

  const searchInput = document.getElementById('rf_cartaPadreSearchInput');
  const suggestBox = document.getElementById('rf_cartaPadreSuggest');
  const removeBtn = document.getElementById('rf_btnRemoveCartaPadre');
  const cancelBtn = document.getElementById('rf_btnCancel');
  const saveBtn = document.getElementById('rf_btnSave');
  const docxBtn = document.getElementById('rf_btnGenerarDocx');

  cancelBtn?.addEventListener('click', closeResponderModal);
  saveBtn?.addEventListener('click', handleSaveResponder);
  removeBtn?.addEventListener('click', clearResponderCartaPadre);
  docxBtn?.addEventListener('click', handleDownloadDocxFromResponder);

  document.querySelectorAll('input[name="rf_tramite_mode"]').forEach(r => {
    r.addEventListener('change', updateResponderTramitePills);
  });

  if(searchInput && suggestBox){
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if(!q || q.length < 2){
        suggestBox.style.display = 'none';
        suggestBox.innerHTML = '';
        return;
      }
      const matches = (ALL_CARTAS || []).filter(c => {
        const doc = String(c.n_documento || '').toLowerCase();
        const asunto = String(c.asunto || '').toLowerCase();
        const esp = String(c.especialidad || '').toLowerCase();
        return (doc.includes(q) || asunto.includes(q) || esp.includes(q)) && canRespondCarta(c);
      }).slice(0, 10);

      if(!matches.length){
        suggestBox.innerHTML = '<div style="padding:10px 14px;color:var(--text-muted);font-size:12px">No se encontraron trámites abiertos pendientes de respuesta</div>';
        suggestBox.style.display = 'block';
        return;
      }

      suggestBox.innerHTML = matches.map(c => `
        <div class="carta-padre-item" data-id="${c.id}">
          <div style="font-weight:700;color:var(--text-primary)">${escapeHtml(cleanSpaces(c.n_documento || 'ID ' + c.id))} <span style="font-size:11px;font-weight:normal;color:var(--text-muted)">(${fmtDate(c.fecha) || 'Sin fecha'})</span></div>
          <div style="font-size:11.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:550px">${escapeHtml(cleanSpaces(c.asunto || 'Sin asunto'))}</div>
          <div style="font-size:10.5px;color:var(--accent);margin-top:2px">${escapeHtml(getEspecialidadDisplay(c))} · ${escapeHtml(cleanSpaces(c.estado_norm || c.estado || 'ABIERTO'))}</div>
        </div>
      `).join('');
      suggestBox.style.display = 'block';

      suggestBox.querySelectorAll('.carta-padre-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = parseInt(item.dataset.id, 10);
          const carta = (ALL_CARTAS||[]).find(x => x.id === id);
          if(carta) selectResponderCartaPadre(carta);
        });
      });
    });

    document.addEventListener('click', (e) => {
      if(!e.target.closest('#responderModalOverlay .carta-padre-widget')){
        suggestBox.style.display = 'none';
      }
    });
  }
}

async function handleSaveResponder(){
  const canCreate = CURRENT_USER && CURRENT_USER.can_create_cartas;
  if (!canCreate) {
    showToast('Solo el Administrador puede registrar respuestas de cartas.', 'error');
    return;
  }

  const doc = document.getElementById('rf_n_documento')?.value?.trim() || '';
  const tipoDoc = document.getElementById('rf_tipo_documento')?.value?.trim() || (responderParentCarta?.tipo_documento || 'CARTA');
  const fecha = document.getElementById('rf_fecha')?.value || '';
  const flujo = document.getElementById('rf_flujo')?.value || 'SUP_TO_RO';
  const esp = document.getElementById('rf_especialidad')?.value?.trim() || '';
  const asunto = document.getElementById('rf_asunto')?.value?.trim() || '';
  const observacion = document.getElementById('rf_observacion')?.value?.trim() || '';
  const refs = document.getElementById('rf_referencias')?.value?.trim() || '';
  const padreDoc = document.getElementById('rf_padre_doc')?.value?.trim() || '';
  const hiloId = document.getElementById('rf_hilo_id')?.value?.trim() || '';
  const modeVal = document.querySelector('input[name="rf_tramite_mode"]:checked')?.value || 'cierre';
  const cierraTramite = modeVal === 'cierre';

  if (!doc) {
    showToast('El N° de Documento que llegó es obligatorio', 'error');
    document.getElementById('rf_n_documento')?.focus();
    return;
  }
  if (!esp) {
    showToast('Debe seleccionar al menos una Especialidad', 'error');
    return;
  }
  if (!asunto) {
    showToast('El Asunto / Texto corto es obligatorio', 'error');
    document.getElementById('rf_asunto')?.focus();
    return;
  }
  if (!padreDoc) {
    showToast('Debe buscar y seleccionar la Carta Padre (amarre del trámite)', 'error');
    document.getElementById('rf_cartaPadreSearchInput')?.focus();
    return;
  }

  let ban = 'recibida_sup', sentido = 'recibida', receptor = 'SUPERVISOR', dirigido_a = 'Residente (RO)', area = 'RESIDENTE';
  let estado = cierraTramite ? 'ABSUELTA POR SUPERVISOR' : 'PENDIENTE CGGC';

  if (flujo === 'SUP_TO_RO') {
    ban = 'recibida_sup'; sentido = 'recibida'; receptor = 'SUPERVISOR'; dirigido_a = 'Residente (RO)'; area = 'RESIDENTE';
    estado = cierraTramite ? 'ABSUELTA POR SUPERVISOR' : 'PENDIENTE CGGC';
  } else if (flujo === 'PRONIS_TO_RL') {
    ban = 'recibida_pronis'; sentido = 'recibida'; receptor = 'PRONIS'; dirigido_a = 'Representante Legal (RL)'; area = 'RESIDENTE';
    estado = cierraTramite ? 'ABSUELTA POR ENTIDAD' : 'PENDIENTE CGGC';
  } else if (flujo === 'SUP_TO_RL') {
    ban = 'recibida_sup'; sentido = 'recibida'; receptor = 'SUPERVISOR'; dirigido_a = 'Representante Legal (RL)'; area = 'RESIDENTE';
    estado = cierraTramite ? 'ABSUELTA POR SUPERVISOR' : 'PENDIENTE CGGC';
  } else if (flujo === 'PRONIS_TO_RO') {
    ban = 'recibida_pronis'; sentido = 'recibida'; receptor = 'PRONIS'; dirigido_a = 'Residente (RO)'; area = 'RESIDENTE';
    estado = cierraTramite ? 'ABSUELTA POR ENTIDAD' : 'PENDIENTE CGGC';
  } else if (flujo === 'MUNI_TO_RO') {
    ban = 'recibida_mpsc'; sentido = 'recibida'; receptor = 'MUNICIPALIDAD'; dirigido_a = 'Residente (RO)'; area = 'RESIDENTE';
    estado = cierraTramite ? 'CERRADO' : 'PENDIENTE CGGC';
  } else if (flujo === 'JRD_TO_RL') {
    ban = 'recibida_otros'; sentido = 'recibida'; receptor = 'JRD'; dirigido_a = 'Representante Legal (RL)'; area = 'RESIDENTE';
    estado = cierraTramite ? 'CERRADO' : 'PENDIENTE CGGC';
  } else if (flujo === 'RO_TO_SUP') {
    ban = 'residente'; sentido = 'emitida'; receptor = 'RESIDENTE'; dirigido_a = 'Supervisión'; area = 'Supervisión';
    estado = cierraTramite ? 'CERRADO' : 'PENDIENTE SUPERVISION';
  } else if (flujo === 'RL_TO_PRONIS') {
    ban = 'rl'; sentido = 'emitida'; receptor = 'REPRESENTANTE LEGAL'; dirigido_a = 'Pronis'; area = 'Pronis';
    estado = cierraTramite ? 'CERRADO' : 'PENDIENTE ENTIDAD';
  }

  const payload = {
    n_documento: doc,
    tipo_documento: tipoDoc,
    fecha: fecha || null,
    bandeja: ban,
    sentido: sentido,
    receptor: receptor,
    dirigido_a: dirigido_a,
    especialidad: esp,
    asunto: asunto,
    observacion: observacion,
    referencia: padreDoc,
    referencias: refs || null,
    area: area,
    estado: estado,
    cerrar_referenciadas: true
  };

  if (hiloId) {
    payload.hilo_id = parseInt(hiloId, 10);
  }

  const btn = document.getElementById('rf_btnSave');
  const cancelBtn = document.getElementById('rf_btnCancel');
  const docxBtn = document.getElementById('rf_btnGenerarDocx');
  if (btn) { btn.disabled = true; btn.textContent = 'Grabando…'; }
  if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.style.opacity = '0.5'; cancelBtn.style.pointerEvents = 'none'; }
  if (docxBtn) { docxBtn.disabled = true; }
  try {
    await saveCarta(payload);
    closeResponderModal();
    showToast('Carta recibida y vinculada exitosamente al hilo', 'success');
    await refreshData();
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ri-save-line"></i> Grabar Carta';
    }
    if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.style.opacity = ''; cancelBtn.style.pointerEvents = ''; }
    if (docxBtn) { docxBtn.disabled = false; }
  }
}

async function handleDownloadDocxFromResponder(){
  const doc = document.getElementById('rf_n_documento')?.value?.trim() || '';
  const fecha = document.getElementById('rf_fecha')?.value || '';
  const flujo = document.getElementById('rf_flujo')?.value || 'SUP_TO_RO';
  const esp = document.getElementById('rf_especialidad')?.value?.trim() || '';
  const asunto = document.getElementById('rf_asunto')?.value?.trim() || '';
  const observacion = document.getElementById('rf_observacion')?.value?.trim() || '';
  const refs = document.getElementById('rf_referencias')?.value?.trim() || '';
  const padreDoc = document.getElementById('rf_padre_doc')?.value?.trim() || '';
  const padreId = document.getElementById('rf_padre_id')?.value?.trim() || '';

  let emisor = 'RO', dirigido_a = 'Supervisión';
  if(flujo === 'SUP_TO_RO'){ emisor = 'RO'; dirigido_a = 'Supervisión'; }
  else if(flujo === 'PRONIS_TO_RL'){ emisor = 'RL'; dirigido_a = 'Pronis'; }
  else if(flujo === 'SUP_TO_RL'){ emisor = 'RL'; dirigido_a = 'Supervisión'; }
  else if(flujo === 'PRONIS_TO_RO'){ emisor = 'RO'; dirigido_a = 'Pronis'; }
  else if(flujo === 'MUNI_TO_RO'){ emisor = 'RO'; dirigido_a = 'Municipalidad'; }
  else if(flujo === 'JRD_TO_RL'){ emisor = 'RL'; dirigido_a = 'JRD'; }
  else if(flujo === 'RO_TO_SUP'){ emisor = 'RO'; dirigido_a = 'Supervisión'; }
  else if(flujo === 'RL_TO_PRONIS'){ emisor = 'RL'; dirigido_a = 'Pronis'; }

  const payload = {
    n_documento: doc || null,
    fecha: fecha || null,
    emisor: emisor,
    dirigido_a: dirigido_a,
    especialidad: esp,
    asunto: asunto,
    observacion: observacion,
    referencia: padreDoc || null,
    referencias: refs || null,
    padre_id: padreId ? parseInt(padreId, 10) : null
  };

  const btnEl = document.getElementById('rf_btnGenerarDocx');
  await descargarBorradorDocx(payload, btnEl);
}

async function handleDownloadDocxFromEdit(){
  const id = editingId;
  const doc = document.getElementById('f_n_documento')?.value?.trim() || '';
  const fecha = document.getElementById('f_fecha')?.value || '';
  const emisor = document.getElementById('f_emisor')?.value || 'RO';
  const dest = document.getElementById('f_destinatario')?.value || '';
  const esp = document.getElementById('f_especialidad')?.value?.trim() || '';
  const asunto = document.getElementById('f_asunto')?.value?.trim() || '';
  const observacion = document.getElementById('f_observacion')?.value?.trim() || '';
  const ref = document.getElementById('f_referencia')?.value?.trim() || '';

  const payload = {
    carta_id: id || null,
    n_documento: doc || null,
    fecha: fecha || null,
    emisor: emisor,
    dirigido_a: dest,
    especialidad: esp,
    asunto: asunto,
    observacion: observacion,
    referencia: ref || null
  };

  const btnEl = document.getElementById('btnGenerarDocxFromEdit');
  await descargarBorradorDocx(payload, btnEl);
}

async function descargarBorradorDocx(payload, btnEl){
  const originalText = btnEl ? btnEl.innerHTML : '';
  if(btnEl){
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite;display:inline-block"></i> Generando Word…';
  }
  try{
    const res = await fetch('/api/cartas/generar-borrador-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload)
    });
    if(!res.ok){
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Error al generar el documento Word');
    }
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    let filename = 'Borrador_Carta_Respuesta.docx';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    if(match && match[1]) filename = match[1];

    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);

    showToast('Borrador oficial en Word (.docx) descargado con éxito', 'success');
  }catch(e){
    console.error('Error generando borrador Word:', e);
    showToast(e.message || 'No se pudo generar el archivo Word', 'error');
  }finally{
    if(btnEl){
      btnEl.disabled = false;
      btnEl.innerHTML = originalText;
    }
  }
}

function collectForm(){
  const d = {};
  FORM_FIELDS.forEach(f => {
    const el = document.getElementById('f_' + f);
    d[f] = el ? el.value.trim() : '';
  });
  d.requiere_respuesta = document.getElementById('f_requiere_respuesta')?.checked ?? true;
  return d;
}

function snapshotCartaForm(){
  cartaFormSnapshot = JSON.stringify(collectForm());
}

function cartaFormIsDirty(){
  if(!document.getElementById('modalOverlay')?.classList.contains('active')) return false;
  return cartaFormSnapshot !== JSON.stringify(collectForm());
}

function getCurrentEditingLabel(){
  if(editingId){
    const c = ALL_CARTAS.find(x => x.id === editingId);
    return c?.n_documento || ('ID ' + editingId);
  }
  const doc = document.getElementById('f_n_documento')?.value?.trim();
  return doc || 'carta nueva (sin guardar)';
}

function focusCartaModalHeader(){
  const title = document.getElementById('modalTitle');
  if(title){
    title.focus({preventScroll: true});
    title.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  }
}

function formHasContent(d){
  if(!d) return false;
  const meaningful = ['n_documento', 'asunto', 'especialidad', 'observacion', 'referencias'];
  return meaningful.some(f => String(d[f] || '').trim() !== '');
}

function findParentCartaFor(d){
  if(!d) return null;
  const currentDocNorm = normalize_doc_key(d.n_documento);
  const currentDt = parseDate(d.fecha)?.getTime() || 0;
  const currentId = d.id || 0;
  
  const chain = typeof getHiloChainCartas === 'function' ? getHiloChainCartas(d) : [];
  const currentIdx = currentId ? chain.findIndex(x => x.id === currentId) : -1;
  
  const isStrictlyEarlier = (candidate) => {
    if(!candidate || candidate.id === currentId) return false;
    const cDt = parseDate(candidate.fecha)?.getTime() || 0;
    if(currentDt && cDt && cDt < currentDt) return true;
    if(currentDt && cDt && cDt === currentDt) {
      if(currentIdx !== -1) {
        const cIdx = chain.findIndex(x => x.id === candidate.id);
        return cIdx !== -1 && cIdx < currentIdx;
      }
      return (candidate.id || 0) < currentId;
    }
    return (candidate.id || 0) < currentId;
  };
  
  // 1. Direct explicit referencia (must be strictly earlier)
  const ref = String(d.referencia || '').trim();
  if(ref && ref !== '—' && ref !== d.n_documento){
    const normRef = normalize_doc_key(ref);
    const parent = (ALL_CARTAS || []).find(x => x.id !== d.id && normalize_doc_key(x.n_documento) === normRef);
    if(parent && isStrictlyEarlier(parent)){
      return parent;
    }
  }
  
  // 2. Parse from referencias (antecedentes citados, strictly earlier)
  const rawRefs = d.referencias || '';
  if(rawRefs && typeof parseReferenciasAntecedentes === 'function'){
    const parts = parseReferenciasAntecedentes(rawRefs);
    for(const p of parts){
      const normP = normalize_doc_key(p);
      if(normP && normP !== currentDocNorm){
        const parent = (ALL_CARTAS || []).find(x => x.id !== d.id && normalize_doc_key(x.n_documento) === normP);
        if(parent && isStrictlyEarlier(parent)){
          return parent;
        }
      }
    }
  }
  
  // 3. From Hilo chain (immediately preceding letter in the thread)
  if(chain && chain.length > 1 && currentIdx > 0){
    return chain[currentIdx - 1]; // Immediately preceding letter in the conversation
  }
  
  return null;
}



function renderCartaPadreCardUI(prefix, parentCarta, currentCartaOrId){
  const card = document.getElementById(prefix ? `${prefix}_cartaPadreSelectedCard` : 'cartaPadreSelectedCard');
  const docEl = document.getElementById(prefix ? `${prefix}_cartaPadreSelectedDoc` : 'cartaPadreSelectedDoc');
  const subEl = document.getElementById(prefix ? `${prefix}_cartaPadreSelectedSub` : 'cartaPadreSelectedSub');
  const timelineEl = document.getElementById(prefix ? `${prefix}_cartaPadreTimelineWrap` : 'cartaPadreTimelineWrap');
  const previewBtn = document.getElementById(prefix ? `${prefix}_btnPreviewCartaPadre` : 'btnPreviewCartaPadre');
  const removeBtn = document.getElementById(prefix ? `${prefix}_btnRemoveCartaPadre` : 'btnRemoveCartaPadre');
  
  if(!card) return;
  
  const currentCarta = typeof currentCartaOrId === 'object' ? currentCartaOrId : (ALL_CARTAS||[]).find(x => x.id === currentCartaOrId);
  const currentId = currentCarta ? currentCarta.id : (currentCartaOrId || editingId);
  const chain = typeof getHiloChainCartas === 'function' ? getHiloChainCartas(currentCarta || parentCarta) : [];
  const currentIdx = currentId ? chain.findIndex(x => x.id === currentId) : -1;
  const hasSuccessors = currentIdx !== -1 && currentIdx < chain.length - 1;
  const numSuccessors = hasSuccessors ? (chain.length - 1 - currentIdx) : 0;

  if(parentCarta){
    const parentDoc = parentCarta.n_documento || ('ID ' + parentCarta.id);
    if(docEl) docEl.innerHTML = `<span class="carta-padre-badge" style="background:#EBF3FA;color:#185A9D;margin-right:6px"><i class="ri-git-branch-line"></i> Carta Padre Vinculada</span><strong>${escapeHtml(parentDoc)}</strong>`;
    
    const emisor = cleanSpaces(quienEnviaLabel(parentCarta));
    const dest = cleanSpaces(quienRecibeLabel(parentCarta));
    const esp = getEspecialidadDisplay(parentCarta);
    const fecha = fmtDate(parentCarta.fecha) || 'Sin fecha';
    const asunto = cleanSpaces(parentCarta.asunto || 'Sin asunto');
    
    if(subEl){
      subEl.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;flex-wrap:wrap">
          <span><strong>${escapeHtml(emisor)}</strong> ➔ <strong>${escapeHtml(dest)}</strong></span>
          <span style="color:var(--text-muted)">📅 ${escapeHtml(fecha)}</span>
          ${esp !== '—' ? `<span class="esp-tag general" style="padding:1px 6px;font-size:10px">${escapeHtml(esp)}</span>` : ''}
        </div>
        <div style="color:var(--text-primary);font-size:12px;margin-top:2px;line-height:1.35;word-break:break-word"><strong>Asunto:</strong> ${escapeHtml(asunto)}</div>
      `;
    }
    if(previewBtn){
      previewBtn.style.display = 'inline-flex';
      previewBtn.onclick = (e) => {
        e.stopPropagation();
        previewRefCarta(parentCarta.id);
      };
    }
    const isCurrentClosed = currentCarta && (isClosedState(currentCarta.estado_norm || currentCarta.estado) || (currentCarta.estado_norm||currentCarta.estado) === 'PARA CONOCIMIENTO');
    const isParentLocked = hasSuccessors || (chain.length > 1) || isCurrentClosed;
    if(removeBtn){
      if(isParentLocked){
        removeBtn.style.display = 'none';
        let lockIndicator = card.querySelector('.padre-lock-indicator');
        if(!lockIndicator){
          lockIndicator = document.createElement('span');
          lockIndicator.className = 'padre-lock-indicator badge-soft';
          lockIndicator.style.fontSize = '11px';
          lockIndicator.style.background = '#F0F5FA';
          lockIndicator.style.color = '#185A9D';
          lockIndicator.style.border = '1px solid #B8D3EE';
          lockIndicator.style.display = 'inline-flex';
          lockIndicator.style.alignItems = 'center';
          lockIndicator.style.gap = '4px';
          lockIndicator.style.padding = '3px 8px';
          lockIndicator.style.borderRadius = '4px';
          const lockTitle = hasSuccessors ? `Protegido: esta carta ya tiene ${numSuccessors} respuesta(s) posterior(es)` : `Protegido: carta vinculada al trámite (${chain.length} cartas)`;
          lockIndicator.title = lockTitle;
          lockIndicator.innerHTML = `<i class="ri-lock-2-line"></i> ${hasSuccessors ? `Trámite protegido (${numSuccessors} derivaciones)` : `Trámite vinculado (${chain.length} cartas)`}`;
          card.querySelector('.carta-padre-actions')?.prepend(lockIndicator);
        }
      } else {
        removeBtn.style.display = 'inline-flex';
        card.querySelector('.padre-lock-indicator')?.remove();
      }
    }
  } else if(chain.length > 1){
    // Es la CARTA INICIAL de un trámite con varias cartas/respuestas posteriores
    if(docEl) docEl.innerHTML = `<span class="carta-padre-badge" style="background:#E1F5EA;color:#1B663E;margin-right:6px"><i class="ri-flag-2-line"></i> CARTA INICIAL DEL TRÁMITE</span><strong>Inicia este trámite (Sin carta previa)</strong>`;
    if(subEl){
      subEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">Este documento dio origen a la conversación. A continuación se muestran las respuestas y cartas derivadas:</div>`;
    }
    if(previewBtn) previewBtn.style.display = 'none';
    if(removeBtn) removeBtn.style.display = 'none';
    card.querySelector('.padre-lock-indicator')?.remove();
  } else {
    const canEdit = CURRENT_USER && (CURRENT_USER.can_edit_cartas || CURRENT_USER.can_edit_formal);
    if (!canEdit) {
      if(docEl) docEl.innerHTML = `<span class="carta-padre-badge" style="background:#F0EEEA;color:var(--text-secondary);margin-right:6px"><i class="ri-file-text-line"></i> TRÁMITE INDEPENDIENTE</span><strong>Sin carta antecedente previa</strong>`;
      if(subEl){
        subEl.innerHTML = `<div style="font-size:12px;color:var(--text-muted)">Esta carta fue registrada como documento inicial directo sin antecedentes previos vinculados.</div>`;
      }
      if(previewBtn) previewBtn.style.display = 'none';
      if(removeBtn) removeBtn.style.display = 'none';
      card.querySelector('.padre-lock-indicator')?.remove();
      if(timelineEl){ timelineEl.style.display = 'none'; timelineEl.innerHTML = ''; }
      card.style.display = 'flex';
      const searchWrap = document.getElementById(prefix ? `${prefix}_cartaPadreSearchWrap` : 'cartaPadreSearchWrap');
      if(searchWrap) searchWrap.style.display = 'none';
      return;
    }
    card.style.display = 'none';
    const searchWrap = document.getElementById(prefix ? `${prefix}_cartaPadreSearchWrap` : 'cartaPadreSearchWrap');
    if(searchWrap) searchWrap.style.display = 'block';
    return;
  }
  
  // Línea de vida / Stepper del trámite
  if(timelineEl){
    if(chain.length > 1){
      const hid = (parentCarta && parentCarta.hilo_id) || (currentCarta && currentCarta.hilo_id) || '';
      let stepsHtml = chain.map((ch, idx) => {
        const isCur = currentId && ch.id === currentId;
        const label = escapeHtml(ch.n_documento || ('ID ' + ch.id));
        const dt = fmtDate(ch.fecha) || '';
        if(isCur){
          return `
            <div class="carta-hilo-step current" style="cursor:default;user-select:none" title="Carta actual en pantalla">
              <span>${idx + 1}.</span> <strong>${label}</strong> ${dt ? `<span style="font-size:10px;opacity:0.9">(${dt})</span>` : ''} <span style="font-size:9.5px;background:rgba(255,255,255,0.25);padding:1px 5px;border-radius:3px;margin-left:2px">Actual</span>
            </div>
          `;
        }
        return `
          <button type="button" class="carta-hilo-step" onclick="previewRefCarta(${ch.id})" title="Clic para ver antecedente (${escapeHtml(ch.asunto||'')})">
            <span>${idx + 1}.</span> <strong>${label}</strong> ${dt ? `<span style="font-size:10px;opacity:0.85">(${dt})</span>` : ''}
          </button>
        `;
      }).join('');
      
      timelineEl.innerHTML = `
        <div class="carta-hilo-stepper" style="display:flex;flex-direction:column;gap:6px;width:100%">
          <div style="width:100%;font-size:11px;font-weight:700;color:var(--text-muted);display:flex;align-items:center;gap:5px">
            <i class="ri-git-merge-line" style="color:var(--accent);font-size:13px"></i> LÍNEA DE VIDA DEL TRÁMITE ${hid ? `(#${hid})` : ''} · ${chain.length} cartas vinculadas:
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%">
            ${stepsHtml}
          </div>
        </div>
      `;
      timelineEl.style.display = 'block';
    } else {
      timelineEl.style.display = 'none';
      timelineEl.innerHTML = '';
    }
  }
  
  card.style.display = 'flex';
  const searchWrap = document.getElementById(prefix ? `${prefix}_cartaPadreSearchWrap` : 'cartaPadreSearchWrap');
  if(searchWrap) searchWrap.style.display = 'none';
  const suggest = document.getElementById(prefix ? `${prefix}_cartaPadreSuggest` : 'cartaPadreSuggest');
  if(suggest) suggest.style.display = 'none';
}

function applyForm(d){
  if(!d) return;
  document.getElementById('f_n_documento').value = d.n_documento || '';
  
  let fVal = d.fecha || '';
  if(fVal) fVal = fVal.slice(0, 10);
  document.getElementById('f_fecha').value = fVal;

  let emisorVal = 'RO';
  const ban = d.bandeja || '';
  const rec = (d.receptor || '').toUpperCase();
  if(ban === 'residente') emisorVal = 'RO';
  else if(ban === 'rl') emisorVal = 'RL';
  else if(ban === 'recibida_sup') emisorVal = 'SUPERVISOR';
  else if(ban === 'recibida_pronis') emisorVal = 'PRONIS';
  else if(ban === 'recibida_mpsc') emisorVal = 'MUNICIPALIDAD';
  else if(ban === 'recibida_otros'){
    if(rec.includes('JRD') || (d.dirigido_a||'').toUpperCase().includes('JRD')) emisorVal = 'JRD';
    else emisorVal = 'SUPERVISOR';
  } else {
    if(rec.includes('LEGAL') || rec.includes('RL')) emisorVal = 'RL';
    else if(rec.includes('SUPERVIS')) emisorVal = 'SUPERVISOR';
    else if(rec.includes('PRONIS') || rec.includes('MINSA')) emisorVal = 'PRONIS';
    else if(rec.includes('MUNICIPAL')) emisorVal = 'MUNICIPALIDAD';
    else emisorVal = 'RO';
  }
  document.getElementById('f_emisor').value = emisorVal;
  updateDestinatarioOptions(d.dirigido_a || (emisorVal === 'RO' ? 'Supervisión' : 'Residente (RO)'));

  if(document.getElementById('f_tipo_documento')){
    document.getElementById('f_tipo_documento').value = d.tipo_documento || 'CARTA';
  }
  populateFormEspChips(d.especialidad || []);

  document.getElementById('f_asunto').value = cleanSpaces(d.asunto || '');
  document.getElementById('f_observacion').value = cleanSpaces(d.observacion || '');
  const rawRefs = d.referencias || '';
  document.getElementById('f_referencias').value = rawRefs;
  populateRefList(rawRefs);

  const est = String(d.estado_norm || d.estado || 'ABIERTO').trim().toUpperCase();
  const fEstadoEl = document.getElementById('f_estado');
  if(fEstadoEl){
    if(est && ![...fEstadoEl.options].some(o => o.value === est)){
      const opt = document.createElement('option');
      opt.value = est;
      opt.textContent = est;
      fEstadoEl.appendChild(opt);
    }
    fEstadoEl.value = est || 'ABIERTO';
  }

  const isSoloInfo = est === 'PARA CONOCIMIENTO' || isClosedState(est);
  const reqCheck = document.getElementById('f_requiere_respuesta');
  
  // Protección de Integridad de Hilo para cartas con respuestas posteriores
  const chain = typeof getHiloChainCartas === 'function' ? getHiloChainCartas(d) : [];
  const currentIdx = chain.findIndex(x => x.id === d.id);
  const hasSuccessors = currentIdx !== -1 && currentIdx < chain.length - 1;
  const numSuccessors = hasSuccessors ? (chain.length - 1 - currentIdx) : 0;
  
  const docInput = document.getElementById('f_n_documento');
  const fechaInput = document.getElementById('f_fecha');
  const tipoDocInput = document.getElementById('f_tipo_documento');
  const emisorSel = document.getElementById('f_emisor');
  const destSel = document.getElementById('f_destinatario');

  const isLinkedResponse = chain.length > 1 && currentIdx > 0;
  const isClosedLetter = isClosedState(est) || est === 'PARA CONOCIMIENTO';

  if(hasSuccessors){
    setCategoriaCartaMode('successors', { numSuccessors });
  } else if(isClosedLetter){
    setCategoriaCartaMode('closed', { estado: est });
  } else if(isLinkedResponse){
    setCategoriaCartaMode('linked');
  } else {
    setCategoriaCartaMode('editable', { requiereRespuesta: !isSoloInfo });
  }

  let pVal = d.plazo_dias;
  if(pVal == null || pVal === '') pVal = 5;
  document.getElementById('f_plazo_dias').value = pVal;
  updatePlazoFromActors();

  if(hasSuccessors || isClosedLetter || isLinkedResponse){
    if(docInput){
      docInput.readOnly = true;
      docInput.style.backgroundColor = '#F4F5F7';
      docInput.style.cursor = 'not-allowed';
      docInput.title = hasSuccessors ? `🔒 Bloqueado: este documento es antecedente de ${numSuccessors} derivaciones en el trámite` : (isLinkedResponse ? '🔒 Bloqueado: documento vinculado como respuesta en el trámite' : '🔒 Bloqueado: trámite concluido');
    }
    if(fechaInput){
      fechaInput.readOnly = true;
      fechaInput.style.backgroundColor = '#F4F5F7';
      fechaInput.style.cursor = 'not-allowed';
      fechaInput.title = '🔒 Bloqueado: fecha fija para mantener la cronología del trámite';
    }
    if(tipoDocInput){
      tipoDocInput.readOnly = true;
      tipoDocInput.style.backgroundColor = '#F4F5F7';
      tipoDocInput.style.cursor = 'not-allowed';
      tipoDocInput.title = '🔒 Bloqueado: documento registrado en el trámite';
    }
    if(emisorSel){
      emisorSel.disabled = true;
      emisorSel.style.backgroundColor = '#F4F5F7';
      emisorSel.style.cursor = 'not-allowed';
      emisorSel.title = '🔒 Bloqueado por flujo documentario activo';
    }
    if(destSel){
      destSel.disabled = true;
      destSel.style.backgroundColor = '#F4F5F7';
      destSel.style.cursor = 'not-allowed';
      destSel.title = '🔒 Bloqueado por flujo documentario activo';
    }
    if(hasSuccessors){
      if(fEstadoEl){
        fEstadoEl.disabled = true;
        fEstadoEl.style.backgroundColor = '#F4F5F7';
        fEstadoEl.style.cursor = 'not-allowed';
        fEstadoEl.title = '🔒 Bloqueado: las cartas intermedias de un trámite resuelto deben permanecer concluidas';
      }
    } else {
      if(fEstadoEl){
        fEstadoEl.disabled = false;
        fEstadoEl.style.backgroundColor = '';
        fEstadoEl.style.cursor = '';
        fEstadoEl.title = '';
      }
    }
  } else {
    if(docInput){
      docInput.readOnly = false;
      docInput.style.backgroundColor = '';
      docInput.style.cursor = '';
      docInput.title = '';
    }
    if(fechaInput){
      fechaInput.readOnly = false;
      fechaInput.style.backgroundColor = '';
      fechaInput.style.cursor = '';
      fechaInput.title = '';
    }
    if(tipoDocInput){
      tipoDocInput.readOnly = false;
      tipoDocInput.style.backgroundColor = '';
      tipoDocInput.style.cursor = '';
      tipoDocInput.title = '';
    }
    if(emisorSel){
      emisorSel.disabled = false;
      emisorSel.style.backgroundColor = '';
      emisorSel.style.cursor = '';
      emisorSel.title = '';
    }
    if(destSel){
      destSel.disabled = false;
      destSel.style.backgroundColor = '';
      destSel.style.cursor = '';
      destSel.title = '';
    }
    if(fEstadoEl){
      fEstadoEl.disabled = false;
      fEstadoEl.style.backgroundColor = '';
      fEstadoEl.style.cursor = '';
      fEstadoEl.title = '';
    }
  }

  const pInput = document.getElementById('f_plazo_dias');
  if(pInput){
    pInput.value = d.caducidad != null && d.caducidad !== '' ? d.caducidad : '';
    pInput.dataset.auto = (d.caducidad == null || d.caducidad === '') ? '1' : '0';
  }
  updatePlazoFromActors();

  const parentCarta = findParentCartaFor(d);
  if(parentCarta){
    document.getElementById('f_referencia').value = parentCarta.n_documento || '';
    document.getElementById('f_hilo_id').value = d.hilo_id || parentCarta.hilo_id || parentCarta.id || '';
    renderCartaPadreCardUI('', parentCarta, d);
  } else {
    document.getElementById('f_referencia').value = '';
    document.getElementById('f_hilo_id').value = d.hilo_id || '';
    renderCartaPadreCardUI('', null, d);
  }

  // Asegurar que se preserve el tipo de documento y especialidad propios de la carta al editar
  if(d.tipo_documento && document.getElementById('f_tipo_documento')){
    document.getElementById('f_tipo_documento').value = d.tipo_documento;
  }
  if(d.especialidad){
    populateFormEspChips(d.especialidad);
  }
}

function saveDraft(){
  return false;
}
function loadDraft(){
  return null;
}
function clearDraft(){
  try { localStorage.removeItem(DRAFT_KEY); } catch(e){}
}
function setDraftHint(visible){
  const h = document.getElementById('draftRestoredHint');
  if(h) h.style.display = 'none';
}

function showModal(){
  const o = document.getElementById('modalOverlay');
  modalClosing = false;
  o.classList.remove('closing');
  o.classList.add('active');
}
function hideModal(cb){
  const o = document.getElementById('modalOverlay');
  if(!o.classList.contains('active') || modalClosing){ cb && cb(); return; }
  modalClosing = true;
  o.classList.add('closing');
  setTimeout(() => {
    o.classList.remove('active', 'closing');
    modalClosing = false;
    setDraftHint(false);
    cb && cb();
  }, 160);
}

function openNewModal(){
  if (CURRENT_USER && !CURRENT_USER.can_create_cartas) {
    showToast('Solo el Administrador puede registrar cartas. Su rol es de consulta.', 'error');
    return;
  }
  setupCartaPadreSearch();
  editingId = null;
  const sumEl = document.getElementById('cartaReadonlySummary');
  if (sumEl) sumEl.style.display = 'none';
  const btnResp = document.getElementById('btnEditGoResponder');
  if (btnResp) btnResp.style.display = 'none';

  document.getElementById('modalTitle').textContent = 'Nueva Carta';
  const sub = document.getElementById('modalSub');
  if (sub) sub.textContent = 'Registra un nuevo documento en el control de cartas';
  document.getElementById('btnSaveForm').innerHTML = '<i class="ri-save-line"></i> Guardar Carta';
  document.getElementById('cartaForm').reset();
  document.getElementById('f_id').value = '';
  populateRefList('');
  
  populateFormEspChips([]);
  clearCartaPadre();
  if(document.getElementById('f_tipo_documento')){
    document.getElementById('f_tipo_documento').value = 'CARTA';
  }
  document.getElementById('f_emisor').value = 'RO';
  updateDestinatarioOptions('Supervisión');
  if(document.getElementById('f_estado')){
    document.getElementById('f_estado').value = 'ABIERTO';
  }
  setCategoriaCartaMode('editable');
  if(document.getElementById('f_requiere_respuesta')){
    document.getElementById('f_requiere_respuesta').checked = true;
  }

  const today = getTodayIso();
  document.getElementById('f_fecha').value = today;

  clearDraft();
  setDraftHint(false);
  updatePlazoFromActors();

  const docInput = document.getElementById('f_n_documento');
  if(docInput){ docInput.readOnly = false; docInput.style.backgroundColor = ''; docInput.style.cursor = ''; docInput.title = ''; }
  const fechaInput = document.getElementById('f_fecha');
  if(fechaInput){ fechaInput.readOnly = false; fechaInput.style.backgroundColor = ''; fechaInput.style.cursor = ''; fechaInput.title = ''; }
  const emisorSel = document.getElementById('f_emisor');
  if(emisorSel){ emisorSel.disabled = false; emisorSel.style.backgroundColor = ''; emisorSel.style.cursor = ''; emisorSel.title = ''; }
  const destSel = document.getElementById('f_destinatario');
  if(destSel){ destSel.disabled = false; destSel.style.backgroundColor = ''; destSel.style.cursor = ''; destSel.title = ''; }
  const fEstadoEl = document.getElementById('f_estado');
  if(fEstadoEl){ fEstadoEl.disabled = false; fEstadoEl.style.backgroundColor = ''; fEstadoEl.style.cursor = ''; fEstadoEl.title = ''; }

  setCartaFormReadOnly(false);
  snapshotCartaForm();
  showModal();
  setTimeout(() => document.getElementById('f_n_documento')?.focus(), 50);
}

function setCartaFormReadOnly(ro){
  const form = document.getElementById('cartaForm');
  if(!form) return;
  form.querySelectorAll('input,select,textarea').forEach(el => {
    if(el.id === 'f_id' || el.id === 'f_referencia' || el.id === 'f_hilo_id') return;
    if(el.closest('.modal-footer')) return;
    if(el.type === 'hidden') return;
    el.disabled = !!ro;
    el.readOnly = !!ro;
    if(ro){
      el.style.pointerEvents = 'none';
      el.style.backgroundColor = 'var(--bg-card, #f8f9fa)';
      el.style.cursor = 'default';
    } else {
      el.style.pointerEvents = '';
      el.style.backgroundColor = '';
      el.style.cursor = '';
    }
  });

  // Action buttons, trashcan buttons, and dynamic adds inside form (EXCEPT timeline steps and preview buttons)
  form.querySelectorAll('button:not(.modal-footer button):not(.carta-hilo-step):not(.btn-padre-preview), #btnAddRefDynamic, #btnEspAddCustom, .ref-dynamic-item button').forEach(el => {
    if(ro){
      el.style.display = 'none';
      el.disabled = true;
      el.style.pointerEvents = 'none';
    } else {
      el.style.display = '';
      el.disabled = false;
      el.style.pointerEvents = '';
    }
  });

  // Explicitly ensure timeline step buttons and preview button are ALWAYS visible and clickable
  form.querySelectorAll('.carta-hilo-step, .btn-padre-preview').forEach(el => {
    el.style.display = 'inline-flex';
    el.disabled = false;
    el.style.pointerEvents = 'auto';
    el.style.opacity = '1';
  });

  const padreInst = document.querySelector('#labelCartaPadre .padre-instruction');
  const padreTitle = document.querySelector('#labelCartaPadre span');
  if(padreInst) padreInst.style.display = ro ? 'none' : '';
  if(padreTitle) padreTitle.textContent = ro ? 'Antecedente / Trámite Vinculado' : 'Carta Padre';

  const removePadreBtn = document.getElementById('btnRemoveCartaPadre');
  if(removePadreBtn && ro) removePadreBtn.style.display = 'none';

  // Especialidad tag chips
  form.querySelectorAll('.esp-tag-chip, .esp-chip').forEach(el => {
    if(ro){
      el.style.pointerEvents = 'none';
      el.style.cursor = 'default';
    } else {
      el.style.pointerEvents = '';
      el.style.cursor = 'pointer';
    }
  });

  // Reference items styling in readonly
  form.querySelectorAll('.ref-dynamic-item').forEach(row => {
    const inp = row.querySelector('.ref-item-input');
    const delBtn = row.querySelector('button');
    if(ro){
      if(delBtn) delBtn.style.display = 'none';
      if(inp){
        inp.readOnly = true;
        inp.disabled = true;
        inp.style.border = 'none';
        inp.style.background = 'transparent';
        inp.style.pointerEvents = 'none';
        inp.style.color = 'var(--text-primary)';
      }
    } else {
      if(delBtn) delBtn.style.display = '';
      if(inp){
        inp.readOnly = false;
        inp.disabled = false;
        inp.style.border = '';
        inp.style.background = '';
        inp.style.pointerEvents = '';
        inp.style.color = '';
      }
    }
  });

  const saveBtn = document.getElementById('btnSaveForm');
  if(saveBtn){
    saveBtn.style.display = ro ? 'none' : '';
    saveBtn.disabled = !!ro;
  }
  const cancelBtn = document.getElementById('btnCancelForm');
  if(cancelBtn){
    cancelBtn.disabled = false;
    cancelBtn.style.pointerEvents = '';
    cancelBtn.style.opacity = '';
    cancelBtn.textContent = ro ? 'Cerrar' : 'Cancelar';
  }
}

async function openEditModal(id){
  try {
    setupCartaPadreSearch();
    let c = ALL_CARTAS.find(x => x.id === id);
    if(!c){
      const r = await apiFetch('/api/cartas/' + id);
      if(!r.ok) throw new Error('No se pudo cargar la información de la carta');
      c = await r.json();
    }
    editingId = id;
    const canEdit = CURRENT_USER && (CURRENT_USER.can_edit_cartas || CURRENT_USER.can_edit_formal);
    const sumEl = document.getElementById('cartaReadonlySummary');
    const sem = analyzeSemanticIntent(c);
    const act = getCartaActionInfo(c);

    const docLabel = c.n_documento || ('ID ' + id);
    const estadoLabel = c.estado_norm || c.estado || '—';

    const btnResp = document.getElementById('btnEditGoResponder');
    if(btnResp){
      if(CURRENT_USER && CURRENT_USER.can_create_cartas && act.canAction){
        btnResp.style.display = 'inline-flex';
        btnResp.title = act.title;
        btnResp.innerHTML = `<i class="${act.icon}"></i> ${act.mode === 'reply' ? 'Responder Trámite' : (act.mode === 'follow' ? 'Continuar / Reiterar' : 'Continuar Hilo')}`;
        btnResp.onclick = () => {
          closeModal();
          openResponderModal(c.id);
        };
      } else {
        btnResp.style.display = 'none';
      }
    }

    if (!canEdit) {
      if (sumEl) {
        sumEl.style.display = 'block';
        const sentido = c.sentido || (String(c.bandeja || '').startsWith('recibida') ? 'recibida' : 'emitida');
        const bLab = (sentido === 'recibida' ? '📥 ' : '📤 ') + bandejaLabel(c.bandeja);
        const espTxt = c.especialidad_norm || c.especialidad || 'GENERAL';
        document.getElementById('csum_bandeja').textContent = bLab;
        if (document.getElementById('csum_especialidad')) document.getElementById('csum_especialidad').textContent = '👷 ' + espTxt;
        if (document.getElementById('csum_doc')) document.getElementById('csum_doc').textContent = docLabel;
        if (document.getElementById('csum_fecha')) document.getElementById('csum_fecha').textContent = fmtDate(c.fecha) || '—';
        if (document.getElementById('csum_remite')) document.getElementById('csum_remite').textContent = c.receptor || (sentido === 'recibida' ? 'SUPERVISOR' : 'RESIDENTE');
        if (document.getElementById('csum_destinatario')) document.getElementById('csum_destinatario').textContent = c.dirigido_a || (sentido === 'recibida' ? 'RESIDENTE' : 'SUPERVISOR');
        if (document.getElementById('csum_padre')) document.getElementById('csum_padre').textContent = c.referencia || '— (Inicia tema)';
        if (document.getElementById('csum_salida_text')) document.getElementById('csum_salida_text').textContent = `${estadoLabel} · ${sem.short_label}`;
        if (document.getElementById('csum_asunto')) document.getElementById('csum_asunto').textContent = c.asunto || 'Sin asunto registrado';
        if (document.getElementById('csum_respaldo')) document.getElementById('csum_respaldo').textContent = c.observacion || 'Sin sustento registrado';
      }
      document.getElementById('modalTitle').textContent = docLabel;
      const sub = document.getElementById('modalSub');
      if (sub) sub.textContent = `Solo lectura · ${bandejaLabel(c.bandeja)} · ${estadoLabel} · ${sem.short_label}`;
    } else {
      if (sumEl) sumEl.style.display = 'none';
      document.getElementById('modalTitle').textContent = docLabel;
      const sub = document.getElementById('modalSub');
      if (sub) sub.textContent = `Editando · ${bandejaLabel(c.bandeja)} · ${estadoLabel} · ${sem.short_label}`;
      document.getElementById('btnSaveForm').innerHTML = '<i class="ri-save-line"></i> Actualizar Carta';
    }

    document.getElementById('f_id').value = id;
    setDraftHint(false);
    populateFormEspChips(c.especialidad);
    applyForm(c);
    setCartaFormReadOnly(!canEdit);
    snapshotCartaForm();
    showModal();
    focusCartaModalHeader();
  } catch (err) {
    console.error('Error en openEditModal:', err);
    showToast(err.message || 'Error al abrir la carta', 'error');
  }
}

function closeModal(opts={}){
  clearDraft();
  setDraftHint(false);
  hideModal(() => { 
    editingId = null; 
    cartaFormSnapshot = null; 
    const form = document.getElementById('cartaForm');
    if(form) form.reset();
  });
}

async function handleSave(){
  const canEdit = CURRENT_USER && (CURRENT_USER.can_edit_cartas || CURRENT_USER.can_edit_formal);
  const canCreate = CURRENT_USER && CURRENT_USER.can_create_cartas;
  if (editingId != null && !canEdit) {
    showToast('Solo el Administrador puede editar cartas.', 'error');
    return;
  }
  if (editingId == null && !canCreate) {
    showToast('Solo el Administrador puede registrar cartas.', 'error');
    return;
  }

  const doc = document.getElementById('f_n_documento')?.value?.trim() || '';
  const tipoDoc = document.getElementById('f_tipo_documento')?.value?.trim() || 'CARTA';
  const fecha = document.getElementById('f_fecha')?.value || '';
  const emisor = document.getElementById('f_emisor')?.value || 'RO';
  const dest = document.getElementById('f_destinatario')?.value || '';
  const esp = document.getElementById('f_especialidad')?.value?.trim() || '';
  const asunto = document.getElementById('f_asunto')?.value?.trim() || '';
  const observacion = document.getElementById('f_observacion')?.value?.trim() || '';
  syncRefListToHiddenField();
  const cartaPadreRef = document.getElementById('f_referencia')?.value?.trim() || '';
  const cartaPadreHilo = document.getElementById('f_hilo_id')?.value?.trim() || '';
  const refs = document.getElementById('f_referencias')?.value?.trim() || '';
  const plazoDias = document.getElementById('f_plazo_dias')?.value?.trim() || '';
  const requiereResp = document.getElementById('f_requiere_respuesta')?.checked ?? true;

  if (!doc) {
    showToast('El Número de Documento / Carta es obligatorio', 'error');
    document.getElementById('f_n_documento')?.focus();
    return;
  }
  if (doc.length > 250) {
    showToast('El Número de Documento no puede superar los 250 caracteres', 'error');
    return;
  }
  if (!esp) {
    showToast('Debe seleccionar al menos una Especialidad', 'error');
    return;
  }
  if (!asunto) {
    showToast('El Asunto es obligatorio', 'error');
    document.getElementById('f_asunto')?.focus();
    return;
  }
  if (fecha) {
    const yr = parseInt(fecha.slice(0, 4), 10);
    if (isNaN(yr) || yr < 1990 || yr > 2099) {
      showToast('La fecha debe estar en un rango válido (1990 a 2099)', 'error');
      return;
    }
  }

  // Bandeja & Sentido mapping
  let ban = 'residente', sentido = 'emitida', receptorLabel = 'RESIDENTE';
  if (emisor === 'RO') { ban = 'residente'; sentido = 'emitida'; receptorLabel = 'RESIDENTE'; }
  else if (emisor === 'RL') { ban = 'rl'; sentido = 'emitida'; receptorLabel = 'REPRESENTANTE LEGAL'; }
  else if (emisor === 'SUPERVISOR') { ban = 'recibida_sup'; sentido = 'recibida'; receptorLabel = 'SUPERVISOR'; }
  else if (emisor === 'PRONIS') { ban = 'recibida_pronis'; sentido = 'recibida'; receptorLabel = 'PRONIS'; }
  else if (emisor === 'JRD') { ban = 'recibida_otros'; sentido = 'recibida'; receptorLabel = 'JRD'; }
  else if (emisor === 'MUNICIPALIDAD') { ban = 'recibida_mpsc'; sentido = 'recibida'; receptorLabel = 'MUNICIPALIDAD'; }

  // Estado mapping & selection
  let estado = document.getElementById('f_estado')?.value?.trim() || '';
  if (!estado) {
    if (!requiereResp) {
      if (cartaPadreRef) {
        estado = (sentido === 'recibida')
          ? (emisor === 'PRONIS' ? 'ABSUELTA POR ENTIDAD' : 'ABSUELTA POR SUPERVISOR')
          : 'CERRADO';
      } else {
        estado = 'PARA CONOCIMIENTO';
      }
    } else if (sentido === 'recibida') {
      estado = 'PENDIENTE CGGC';
    } else {
      if (dest.toUpperCase().includes('SUPERVIS')) estado = 'PENDIENTE SUPERVISION';
      else if (dest.toUpperCase().includes('PRONIS')) estado = 'PENDIENTE ENTIDAD';
      else if (dest.toUpperCase().includes('MUNICIPAL')) estado = 'PENDIENTE MUNICIPALIDAD';
      else if (dest.toUpperCase().includes('JRD')) estado = 'PENDIENTE JRD';
      else estado = 'ABIERTO';
    }
  }

  const data = {
    n_documento: doc,
    tipo_documento: tipoDoc,
    fecha: fecha || null,
    bandeja: ban,
    sentido: sentido,
    receptor: receptorLabel,
    dirigido_a: dest,
    especialidad: esp,
    asunto: asunto,
    observacion: observacion,
    referencia: cartaPadreRef || null,
    referencias: refs || null,
    caducidad: plazoDias || null,
    area: (sentido === 'recibida' ? 'RESIDENTE' : dest),
    estado: estado,
    cerrar_referenciadas: Boolean(cartaPadreRef)
  };

  if (cartaPadreHilo) {
    data.hilo_id = parseInt(cartaPadreHilo, 10);
  }

  const wasEdit = editingId != null;
  if (wasEdit) data.id = editingId;

  // Snapshot previo para rollback en caso de fallo en backend
  let prevSnapshot = null;
  let prevIdx = -1;
  if (wasEdit) {
    prevIdx = ALL_CARTAS.findIndex(x => x.id === editingId);
    if (prevIdx >= 0) {
      prevSnapshot = { ...ALL_CARTAS[prevIdx] };
      // Actualización optimista inmediata en memoria (0 ms)
      ALL_CARTAS[prevIdx] = { ...ALL_CARTAS[prevIdx], ...data };
      prepareCartasSearchCache(ALL_CARTAS);
      applyFilters(true);
    }
    closeModal({ fromSave: true });
    showToast('Carta actualizada exitosamente', 'success');
  }

  const btn = document.getElementById('btnSaveForm');
  const cancelBtn = document.getElementById('btnCancelForm');
  const docxBtn = document.getElementById('btnGenerarDocxFromEdit');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  if (cancelBtn) { cancelBtn.disabled = true; cancelBtn.style.opacity = '0.5'; cancelBtn.style.pointerEvents = 'none'; }
  if (docxBtn) { docxBtn.disabled = true; docxBtn.style.opacity = '0.5'; docxBtn.style.pointerEvents = 'none'; }

  try {
    const saved = await saveCarta(data);
    if (!wasEdit) {
      clearDraft();
      closeModal({ fromSave: true });
      showToast('Carta registrada exitosamente', 'success');
      if (saved && saved.id) {
        ALL_CARTAS.unshift(saved);
        prepareCartasSearchCache(ALL_CARTAS);
        applyFilters(true);
      }
    } else if (saved && saved.id && prevIdx >= 0) {
      ALL_CARTAS[prevIdx] = { ...ALL_CARTAS[prevIdx], ...saved };
      prepareCartasSearchCache(ALL_CARTAS);
      applyFilters(true);
    }
    refreshData(true);
  }
  catch (e) {
    if (wasEdit && prevSnapshot && prevIdx >= 0) {
      ALL_CARTAS[prevIdx] = prevSnapshot;
      prepareCartasSearchCache(ALL_CARTAS);
      applyFilters(true);
    }
    showToast('Error al guardar: ' + e.message, 'error');
  }
  finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = wasEdit ? '<i class="ri-save-line"></i> Actualizar Carta' : '<i class="ri-save-line"></i> Guardar Carta';
    }
    if (cancelBtn) { cancelBtn.disabled = false; cancelBtn.style.opacity = ''; cancelBtn.style.pointerEvents = ''; }
    if (docxBtn) { docxBtn.disabled = false; docxBtn.style.opacity = ''; docxBtn.style.pointerEvents = ''; }
  }
}

function confirmDelete(id){
  if (CURRENT_USER && !CURRENT_USER.can_delete_cartas) {
    showToast('No tienes permiso para eliminar cartas', 'error');
    return;
  }
  deleteId=id;confirmAction='delete';
  const c=ALL_CARTAS.find(x=>x.id===id);
  document.getElementById('confirmTitle').textContent='Eliminar carta';
  document.getElementById('confirmMsg').textContent=c?`¿Eliminar la carta "${c.n_documento||id}"? Esta acción no se puede deshacer.`:'¿Eliminar esta carta?';
  const okBtn=document.getElementById('btnConfirmOk');
  if(okBtn){
    okBtn.disabled=false;
    okBtn.textContent='Eliminar';
    okBtn.style.background='';
  }
  document.getElementById('confirmOverlay').classList.add('active');
}
let toggleTargetUser=null,toggleTargetActivo=false;

function closeConfirm(){
  const overlay=document.getElementById('confirmOverlay');
  if(overlay){
    overlay.classList.remove('active');
    overlay.style.zIndex='';
  }
  deleteId=null;
  confirmAction=null;
  switchEditTargetId=null;
  toggleTargetUser=null;
  selectedExcelFile=null;
  const fileInput=document.getElementById('excelFileInput');
  if(fileInput) fileInput.value = '';
  const okBtn=document.getElementById('btnConfirmOk');
  if(okBtn){
    okBtn.disabled=false;
    okBtn.style.background='';
  }
}
async function executeDelete(){
  if(!deleteId)return;
  const targetId = deleteId;
  const btn = document.getElementById('btnConfirmOk');
  if(btn){
    btn.disabled = true;
    btn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.6s linear infinite;margin-right:6px;vertical-align:middle;"></span>Eliminando…';
  }
  try{
    // 1. Cierre inmediato del modal y eliminación optimista en memoria
    ALL_CARTAS = ALL_CARTAS.filter(x => x.id !== targetId);
    applyFilters(true);
    closeConfirm();
    showToast('Carta eliminada correctamente', 'success');

    // 2. Ejecución rápida en backend
    await deleteCarta(targetId);
    refreshData(true);
  }catch(e){
    showToast('Error al eliminar: '+e.message, 'error');
    refreshData(true);
  }finally{
    if(btn){
      btn.disabled = false;
      btn.textContent = 'Eliminar';
    }
  }
}

