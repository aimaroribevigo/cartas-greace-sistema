function confirmToggleUser(user, activo){
  toggleTargetUser=user;
  toggleTargetActivo=activo;
  confirmAction='user_toggle';
  const title=activo?'Activar usuario':'Desactivar usuario';
  const actionText=activo?'Activar cuenta':'Desactivar cuenta';
  const uname=user.username||user.nombre||'este usuario';
  const msg=activo
    ?`¿Estás seguro de activar al usuario <strong>@${escapeHtml(uname)}</strong>?<br/><span style="font-size:12px;color:var(--text-muted);display:inline-block;margin-top:6px">Podrá volver a iniciar sesión y acceder a sus funciones según su rol (${escapeHtml(user.rol)}).</span>`
    :`¿Estás seguro de desactivar al usuario <strong>@${escapeHtml(uname)}</strong>?<br/><span style="font-size:12px;color:var(--rose);display:inline-block;margin-top:6px">⚠️ El usuario no podrá iniciar sesión en el sistema mientras su cuenta esté desactivada.</span>`;
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').innerHTML=msg;
  const okBtn=document.getElementById('btnConfirmOk');
  if(okBtn){
    okBtn.disabled=false;
    okBtn.textContent=actionText;
    okBtn.style.background=activo?'var(--teal)':'var(--rose)';
  }
  document.getElementById('confirmOverlay').classList.add('active');
}
async function executeToggleUser(){
  if(!toggleTargetUser)return;
  const btn=document.getElementById('btnConfirmOk');
  if(btn)btn.disabled=true;
  const id=toggleTargetUser.id,activo=toggleTargetActivo;
  const uname=toggleTargetUser.username||toggleTargetUser.nombre||'usuario';
  try{
    const r=await apiFetch('/api/auth/users/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({activo})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Error al cambiar estado');
    closeConfirm();
    showToast(activo?`Usuario @${uname} activado`:`Usuario @${uname} desactivado`,'success');
    await loadUsersAdmin();
  }catch(e){showToast('Error: '+e.message,'error');}
  finally{if(btn)btn.disabled=false;}
}
function confirmLogout(){
  confirmAction='logout';
  deleteId=null;
  toggleTargetUser=null;
  const uname=CURRENT_USER?(CURRENT_USER.nombre||CURRENT_USER.username):'tu cuenta';
  document.getElementById('confirmTitle').textContent='Cerrar sesión';
  document.getElementById('confirmMsg').innerHTML=`¿Estás seguro de que deseas salir del sistema?<br/><span style="font-size:12.5px;color:var(--text-muted);display:inline-block;margin-top:6px">Se cerrará la sesión activa de <strong>@${escapeHtml(uname)}</strong>.</span>`;
  const okBtn=document.getElementById('btnConfirmOk');
  if(okBtn){
    okBtn.disabled=false;
    okBtn.textContent='Cerrar sesión';
    okBtn.style.background='var(--rose)';
  }
  document.getElementById('confirmOverlay').classList.add('active');
}
async function executeLogout(){
  const btn=document.getElementById('btnConfirmOk');
  if(btn){btn.disabled=true;btn.textContent='Cerrando…';}
  try{
    await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  }catch(_){}
  finally{
    if(btn){btn.disabled=false;btn.textContent='Confirmar';}
    closeConfirm();
    CURRENT_USER=null;
    ALL_CARTAS=[];
    filtered=[];
    applyUserChrome(null);
    hidePwdGate();
    showLoginGate('');
    showToast('Sesión cerrada correctamente','info');
  }
}
async function executeSwitchCarta(){
  const id=switchEditTargetId;
  if(!id){closeConfirm();return;}
  closeConfirm();
  closeRefPreview();
  try{
    await openEditModal(id);
    const c=ALL_CARTAS.find(x=>x.id===id);
    showToast('Editando: '+(c?.n_documento||('ID '+id)),'info');
  }catch(e){
    showToast(e.message||'No se pudo abrir la carta','error');
  }
}

function confirmOpenCartaInEditor(targetId){
  const target=ALL_CARTAS.find(x=>x.id===targetId);
  const targetLabel=target?.n_documento||('ID '+targetId);
  const canEdit=CURRENT_USER&&(CURRENT_USER.can_edit_cartas||CURRENT_USER.can_edit_formal);
  const openVerb=canEdit?'Editando':'Consultando';

  if(editingId===targetId){
    closeRefPreview();
    focusCartaModalHeader();
    return;
  }

  const modalOpen=document.getElementById('modalOverlay')?.classList.contains('active');
  if(!modalOpen){
    closeRefPreview();
    openEditModal(targetId).then(()=>{
      showToast(openVerb+': '+targetLabel,'info');
    }).catch(e=>showToast(e.message||'Error al abrir','error'));
    return;
  }

  switchEditTargetId=targetId;
  confirmAction='switch_carta';
  document.getElementById('confirmTitle').textContent=canEdit?'¿Cambiar de carta?':'¿Ver otra carta?';
  const leavingLabel=getCurrentEditingLabel();
  const dirtyNote=(canEdit&&cartaFormIsDirty())?' Los cambios sin guardar se perderán.':'';
  document.getElementById('confirmMsg').textContent=`Estás ${canEdit?'editando':'viendo'} «${leavingLabel}». ¿Abrir «${targetLabel}»?${dirtyNote}`;
  const okBtn=document.getElementById('btnConfirmOk');
  if(okBtn){
    okBtn.disabled=false;
    okBtn.textContent=canEdit?'Abrir carta':'Ver carta';
    okBtn.style.background='var(--accent)';
  }
  const overlay=document.getElementById('confirmOverlay');
  overlay.style.zIndex='100001';
  overlay.classList.add('active');
}

async function handleConfirmOk(){
  if(confirmAction==='reimport_file')return executeReimportFile();
  if(confirmAction==='reimport')return executeReimport();
  if(confirmAction==='delete')return executeDelete();
  if(confirmAction==='user_toggle')return executeToggleUser();
  if(confirmAction==='logout')return executeLogout();
  if(confirmAction==='switch_carta')return executeSwitchCarta();
}

async function sendWhatsapp(){
  try{
    showToast('Preparando digest WhatsApp (Yo debo)…','info');
    const r=await apiFetch('/api/notify/send',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({force:true,mode:'debo'})
    });
    const d=await r.json().catch(()=>({}));
    if(d.sent){showToast('WhatsApp enviado (Yo debo)','success');return;}
    if(d.reason==='sin_alertas'){showToast('No hay cartas en “Yo debo” para notificar','info');return;}
    if(d.provider_result&&d.provider_result.skipped){
      showToast(d.provider_result.error||'WhatsApp deshabilitado. Configura .env','error');
      return;
    }
    showToast('WhatsApp: '+(d.error||d.reason||(d.provider_result&&d.provider_result.error)||'No se pudo enviar'),'error');
  }catch(e){showToast('Error WhatsApp: '+e.message,'error');}
}

function filterVencidas(go){document.getElementById('filterPlazo').value='vencida';applyFilters();if(go)goToCartasWithFilters();else showToast('Filtro: cartas vencidas','info');}

function exportCSV(){
  const headers=['#','N° Carta','Fecha','Tipo de Documento','Especialidad','Quién Envía','Quién Recibe','Asunto','Referencia','Quién Responde','Fecha de Atraso','Estado de Trámite','Observación'];
  const rows=filtered.map((c,idx)=>{
    const st=deadlineStatus(c);
    const itemNumber=idx+1;
    const resp=(typeof getRespRespuestaLabel==='function')?yoDeboResponderLabel(c):'';
    return[itemNumber,c.n_documento||'',c.fecha||'',getTipoDocumentoDisplay(c),getEspecialidadDisplay(c),quienEnviaLabel(c),quienRecibeLabel(c),c.asunto||'',getCartaReferenciaDisplay(c),resp,st.label,c.estado_norm||c.estado||'',c.observacion||''];
  });
  const csv=[headers,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  a.download='cartas_sistema_greace.csv';a.click();
}

async function downloadBackupExcel(){
  const btn = document.getElementById('btnDownloadBackupExcel');
  if(!btn || btn.disabled) return;
  const originalHtml = btn.innerHTML;

  try {
    btn.disabled = true;
    btn.style.opacity = '0.65';
    btn.style.cursor = 'not-allowed';
    btn.innerHTML = '<i class="ri-loader-4-line" style="animation:rot 1s linear infinite;display:inline-block"></i> Generando Backup Excel…';
    showToast('Generando respaldo Excel con las 6 hojas. Por favor espera...', 'info');

    const res = await apiFetch('/api/backup/excel', { method: 'GET' });
    if(!res.ok){
      throw new Error('Error en el servidor al generar el archivo de backup');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    const now = new Date();
    const dStr = now.toISOString().slice(0,10).replace(/-/g,'');
    const tStr = String(now.getHours()).padStart(2,'0') + String(now.getMinutes()).padStart(2,'0');
    a.download = `Backup_Control_Cartas_HLP_${dStr}_${tStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      a.remove();
    }, 1500);
    showToast('¡Respaldo Excel descargado con éxito!', 'success');
  } catch(err){
    console.error('Error descargando backup excel:', err);
    showToast('Error al descargar el backup: ' + err.message, 'error');
  } finally {
    if(btn){
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = 'pointer';
      btn.innerHTML = originalHtml;
    }
  }
}

document.querySelectorAll('.view-tab').forEach(btn=>btn.addEventListener('click',()=>{
  showView(btn.dataset.view);
  if(isMobileScreen())closeMobileSidebar();
}));
document.getElementById('btnReset')?.addEventListener('click',resetFilters);
document.getElementById('filterBandeja')?.addEventListener('change',()=>{activeBandeja=document.getElementById('filterBandeja')?.value||'all';applyFilters();});
document.getElementById('btnJumpCartas')?.addEventListener('click',goToCartasWithFilters);
document.getElementById('btnFilterVencidasReportes')?.addEventListener('click',()=>filterVencidas(true));
document.getElementById('btnNewCarta')?.addEventListener('click',openNewModal);
document.getElementById('modalClose')?.addEventListener('click',()=>closeModal());
document.getElementById('btnCancelForm')?.addEventListener('click',()=>closeModal());
document.getElementById('btnSaveForm')?.addEventListener('click',handleSave);
document.getElementById('f_referencias')?.addEventListener('blur',(e)=>{
  const v=e.target.value;
  if(v) e.target.value=formatReferenciasAntecedentes(v)||cleanSpaces(v);
});
document.getElementById('f_bandeja')?.addEventListener('change',updateBandejaHint);
document.getElementById('f_especialidad')?.addEventListener('change',()=>suggestAreaFromEspecialidad(true));

function previewRefCarta(id){
  const c=ALL_CARTAS.find(x=>x.id===id);
  if(!c){showToast('Carta no encontrada','error');return;}
  const cl=classif(c);
  const isOut=c.sentido==='emitida'||String(c.bandeja||'').startsWith('emitida');
  
  const flEl=document.getElementById('prev_flujo');
  if(flEl){
    flEl.className=`flujo-badge ${isOut?'flujo-out':'flujo-in'}`;
    flEl.innerHTML=`<span class="flujo-emisor">${cl.emisor_code||(isOut?'RO':'SUP')}</span> <i class="ri-arrow-right-line" style="font-size:10px;opacity:0.7"></i> <span class="flujo-dest">${cl.dest_code||(isOut?'SUP':'RO')}</span>`;
  }
  document.getElementById('prev_doc').textContent=c.n_documento||('ID '+id);
  document.getElementById('prev_fecha').textContent=fmtDate(c.fecha)||'—';
  document.getElementById('prev_estado').innerHTML=`<span class="status-badge ${estadoBadgeClass(c.estado_norm)}">${escapeHtml(c.estado_norm||c.estado||'—')}</span>`;
  document.getElementById('prev_especialidad').textContent=c.especialidad||c.especialidad_norm||'—';
  document.getElementById('prev_area').textContent=(c.area||'').trim()||'Sin asignar';
  document.getElementById('prev_bandeja').textContent=bandejaLabel(c.bandeja);
  document.getElementById('prev_destinatario').textContent=c.dirigido_a||c.receptor||'—';
  document.getElementById('prev_asunto').textContent=c.asunto||'Sin asunto registrado';
  
  const prevRefEl = document.getElementById('prev_referencias');
  if(prevRefEl){
    prevRefEl.innerHTML = renderReferenciasPreviewHtml(c.referencias);
  }

  const btnOpen=document.getElementById('btnPrevOpenEdit');
  if(btnOpen){
    const canEdit=CURRENT_USER&&(CURRENT_USER.can_edit_cartas||CURRENT_USER.can_edit_formal);
    btnOpen.innerHTML=canEdit?'<i class="ri-edit-line"></i> Abrir en Editor':'<i class="ri-eye-line"></i> Ver detalle';
    btnOpen.onclick=()=>confirmOpenCartaInEditor(id);
  }

  document.getElementById('refPreviewOverlay')?.classList.add('active');
}

function closeRefPreview(){
  document.getElementById('refPreviewOverlay')?.classList.remove('active');
}

function setCategoriaCartaMode(mode, info = {}){
  const interactiveWrap = document.getElementById('reqCheckInteractiveWrap');
  const lockedWrap = document.getElementById('reqCheckLockedWrap');
  const reqCheck = document.getElementById('f_requiere_respuesta');
  const iconEl = document.getElementById('reqLockIcon');
  const titleEl = document.getElementById('reqLockTitle');
  const subEl = document.getElementById('reqLockSubtitle');
  const badgeEl = document.getElementById('reqLockBadge');
  
  if(mode === 'successors'){
    if(reqCheck) reqCheck.checked = true;
    if(interactiveWrap) interactiveWrap.style.display = 'none';
    if(lockedWrap) {
      lockedWrap.style.display = 'flex';
      lockedWrap.style.background = '#F0F5FA';
      lockedWrap.style.borderColor = '#B8D3EE';
    }
    if(iconEl) { iconEl.className = 'ri-lock-2-line'; iconEl.style.color = '#185A9D'; }
    if(titleEl) titleEl.textContent = 'Vinculación y Categoría Protegidas';
    if(subEl) subEl.textContent = `Esta carta ya cuenta con ${info.numSuccessors || 1} respuesta(s) registrada(s) en el expediente.`;
    if(badgeEl) {
      badgeEl.style.background = '#E1EDF7';
      badgeEl.style.color = '#185A9D';
      badgeEl.textContent = `🔒 BLOQUEADO (${info.numSuccessors || 1} derivaciones)`;
    }
  } else if(mode === 'closed'){
    if(reqCheck) reqCheck.checked = false;
    if(interactiveWrap) interactiveWrap.style.display = 'none';
    if(lockedWrap) {
      lockedWrap.style.display = 'flex';
      lockedWrap.style.background = '#F4F9F5';
      lockedWrap.style.borderColor = '#B7E4C7';
    }
    if(iconEl) { iconEl.className = 'ri-checkbox-circle-line'; iconEl.style.color = '#1B663E'; }
    if(titleEl) titleEl.textContent = 'Trámite Concluido';
    if(subEl) subEl.textContent = `El documento figura como ${info.estado || 'CERRADO'}. Para reabrirlo, cambia el Estado a EN TRÁMITE.`;
    if(badgeEl) {
      badgeEl.style.background = '#D8F3DC';
      badgeEl.style.color = '#1B663E';
      badgeEl.textContent = `✓ CONCLUIDO / ${info.estado || 'CERRADO'}`;
    }
  } else {
    if(interactiveWrap) interactiveWrap.style.display = 'flex';
    if(lockedWrap) lockedWrap.style.display = 'none';
    if(reqCheck) reqCheck.disabled = false;
  }
}

function addRefListItem(val = '', containerId = 'referenciasListContainer', hiddenInputId = 'f_referencias'){
  const container = document.getElementById(containerId);
  if(!container) return;
  
  const placeholder = container.querySelector('.ref-empty-hint');
  if(placeholder) placeholder.remove();
  
  const rowId = 'ref_item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const row = document.createElement('div');
  row.className = 'ref-dynamic-item';
  row.id = rowId;
  row.dataset.containerId = containerId;
  row.dataset.hiddenInputId = hiddenInputId;
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.gap = '8px';
  row.style.background = '#FFFFFF';
  row.style.padding = '6px 10px';
  row.style.border = '1px solid var(--border)';
  row.style.borderRadius = '6px';
  row.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
  
  row.innerHTML = `
    <i class="ri-file-text-line ref-item-icon" style="color:var(--text-muted);font-size:15px;flex-shrink:0"></i>
    <input type="text" class="ref-item-input" placeholder="Escribe el documento citado o pega un link (Google Drive, OneDrive, etc.)" value="${escapeHtml(val)}" style="flex:1;font-size:12.5px;padding:5px 8px;border:1px solid #E0DFDB;border-radius:4px" oninput="handleRefInputLive(this)">
    <a href="#" target="_blank" rel="noopener noreferrer" class="ref-item-open-btn" style="display:none;align-items:center;gap:4px;padding:4px 10px;font-size:11.5px;font-weight:600;background:#EBF3FA;color:#185A9D;border:1px solid #B8D3EE;border-radius:4px;text-decoration:none;flex-shrink:0" title="Abrir en nueva pestaña">
      <i class="ri-external-link-line"></i> Abrir
    </a>
    <button type="button" class="btn-cancel" onclick="removeRefListItem('${rowId}', '${containerId}', '${hiddenInputId}')" style="padding:4px 6px;font-size:13px;color:var(--rose);border:none;background:transparent;cursor:pointer;flex-shrink:0" title="Eliminar ítem">
      <i class="ri-delete-bin-line"></i>
    </button>
  `;
  
  container.appendChild(row);
  const inputEl = row.querySelector('.ref-item-input');
  if(inputEl){
    handleRefInputLive(inputEl);
    if(!val) inputEl.focus();
  }
}

function handleRefInputLive(inputEl){
  const row = inputEl.closest('.ref-dynamic-item');
  if(!row) return;
  const containerId = row.dataset.containerId || 'referenciasListContainer';
  const hiddenInputId = row.dataset.hiddenInputId || 'f_referencias';
  const val = String(inputEl.value || '').trim();
  const openBtn = row.querySelector('.ref-item-open-btn');
  const iconEl = row.querySelector('.ref-item-icon');
  
  const isUrl = /^https?:\/\//i.test(val) || /^(drive\.google|docs\.google|onedrive|sharepoint)/i.test(val);
  const urlMatch = val.match(/https?:\/\/[^\s]+/i);
  
  if(isUrl || urlMatch){
    let url = urlMatch ? urlMatch[0] : val;
    if(!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
    
    if(openBtn){
      openBtn.href = url;
      openBtn.style.display = 'inline-flex';
      if(url.includes('drive.google') || url.includes('docs.google')){
        openBtn.innerHTML = '<i class="ri-google-drive-fill"></i> Abrir Drive';
      } else if(url.includes('onedrive') || url.includes('sharepoint')){
        openBtn.innerHTML = '<i class="ri-microsoft-fill"></i> Abrir OneDrive';
      } else {
        openBtn.innerHTML = '<i class="ri-external-link-line"></i> Abrir link';
      }
    }
    if(iconEl){
      iconEl.className = (url.includes('drive.google') ? 'ri-google-drive-fill' : 'ri-link') + ' ref-item-icon';
      iconEl.style.color = '#1A73E8';
    }
  } else {
    if(openBtn) openBtn.style.display = 'none';
    if(iconEl){
      iconEl.className = 'ri-file-text-line ref-item-icon';
      iconEl.style.color = 'var(--text-muted)';
    }
  }
  syncRefListToHiddenField(containerId, hiddenInputId);
}

function removeRefListItem(rowId, containerId = 'referenciasListContainer', hiddenInputId = 'f_referencias'){
  const el = document.getElementById(rowId);
  if(el) {
    containerId = el.dataset.containerId || containerId;
    hiddenInputId = el.dataset.hiddenInputId || hiddenInputId;
    el.remove();
  }
  const container = document.getElementById(containerId);
  if(container && !container.children.length){
    container.innerHTML = `<div class="ref-empty-hint" style="color:var(--text-muted);font-size:11.5px;text-align:center;padding:8px">Sin referencias ni enlaces. Haz clic en <strong>Agregar Referencia o Link</strong> para añadir documentos o enlaces de Drive/OneDrive.</div>`;
  }
  syncRefListToHiddenField(containerId, hiddenInputId);
}

function syncRefListToHiddenField(containerId = 'referenciasListContainer', hiddenInputId = 'f_referencias'){
  const container = document.getElementById(containerId);
  if(!container) return;
  const rows = container.querySelectorAll('.ref-dynamic-item');
  const items = [];
  rows.forEach(r => {
    const val = r.querySelector('.ref-item-input')?.value?.trim() || '';
    if(val) items.push(val);
  });
  const hiddenInput = document.getElementById(hiddenInputId);
  if(hiddenInput) hiddenInput.value = items.join('\n');
}

const REF_ANT_DOC_RE=/(?:CARTA|INFORME|OFICIO|ASIENTO|CONTRATO|MEMO|NOTARIAL|RESOLUCION|ACTA)(?:\s+DE\s+(?:[^N°\n\r]+?))?\s*N[°º.]?\s*[A-Z0-9\-/.()]+(?:\s*\([^)]*\))?/gi;

function parseReferenciasAntecedentes(raw){
  const s = String(raw || '').replace(/\t/g, ' ').trim();
  if(!s) return [];
  
  if(s.includes('\n')){
    return s.split('\n').map(x => cleanSpaces(x).trim()).filter(Boolean);
  }
  
  if(/\s{3,}/.test(s)){
    return s.split(/\s{3,}/).map(x => cleanSpaces(x).trim()).filter(Boolean);
  }
  
  const seen = new Set();
  const out = [];
  const push = t => {
    const x = String(t).replace(/\s+/g, ' ').trim();
    if(x.length < 3) return;
    const k = x.toLowerCase();
    if(seen.has(k)) return;
    seen.add(k);
    out.push(x);
  };
  
  REF_ANT_DOC_RE.lastIndex = 0;
  let m;
  while((m = REF_ANT_DOC_RE.exec(s)) !== null){
    push(m[0]);
  }
  
  if(!out.length){
    s.split(/[,;\t]+|\s+Y\s+/i).forEach(part => {
      part.split(/\s{2,}/).forEach(push);
      if(part.trim()) push(part);
    });
  }
  
  if(!out.length && s) push(cleanSpaces(s));
  return out;
}

function populateRefList(rawRefs, containerId = 'referenciasListContainer', hiddenInputId = 'f_referencias'){
  const container = document.getElementById(containerId);
  if(!container) return;
  container.innerHTML = '';
  
  if(!rawRefs || !String(rawRefs).trim()){
    container.innerHTML = `<div class="ref-empty-hint" style="color:var(--text-muted);font-size:11.5px;text-align:center;padding:8px">Sin referencias ni enlaces. Haz clic en <strong>Agregar Referencia o Link</strong> para añadir documentos o enlaces de Drive/OneDrive.</div>`;
    syncRefListToHiddenField(containerId, hiddenInputId);
    return;
  }
  
  const parts = parseReferenciasAntecedentes(rawRefs);
  if(!parts.length){
    container.innerHTML = `<div class="ref-empty-hint" style="color:var(--text-muted);font-size:11.5px;text-align:center;padding:8px">Sin referencias ni enlaces. Haz clic en <strong>Agregar Referencia o Link</strong> para añadir documentos o enlaces de Drive/OneDrive.</div>`;
  } else {
    parts.forEach(p => addRefListItem(cleanSpaces(p), containerId, hiddenInputId));
  }
  syncRefListToHiddenField(containerId, hiddenInputId);
}

function renderReferenciasPreviewHtml(rawRefs){
  const s = String(rawRefs || '').trim();
  if(!s) return '<span style="color:var(--text-muted)">Ninguna</span>';
  
  const rawList = s.includes('\n') ? s.split('\n') : (typeof parseReferenciasAntecedentes === 'function' ? parseReferenciasAntecedentes(s) : [s]);
  const parts = rawList.map(p => p.trim()).filter(Boolean);
  if(!parts.length) return '<span style="color:var(--text-muted)">Ninguna</span>';
  
  return `<div style="display:flex;flex-direction:column;gap:5px">` + parts.map(item => {
    const isUrl = /^https?:\/\//i.test(item) || /^(drive\.google|docs\.google|onedrive|sharepoint)/i.test(item);
    if(isUrl){
      let url = item;
      if(!url.startsWith('http')) url = 'https://' + url;
      const isDrive = url.includes('drive.google') || url.includes('docs.google');
      const isOneDrive = url.includes('onedrive') || url.includes('sharepoint');
      const icon = isDrive ? 'ri-google-drive-fill' : (isOneDrive ? 'ri-microsoft-fill' : 'ri-external-link-line');
      const label = isDrive ? 'Abrir Google Drive' : (isOneDrive ? 'Abrir OneDrive' : 'Abrir Enlace Web');
      return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px dashed var(--border)">
        <span style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:350px"><i class="${icon}" style="color:#1A73E8;margin-right:4px"></i> ${escapeHtml(item)}</span>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="ref-link-chip" style="font-size:11.5px;font-weight:700;padding:3px 10px;background:#EBF3FA;color:#185A9D;border:1px solid #B8D3EE;border-radius:4px;text-decoration:none;display:inline-flex;align-items:center;gap:4px" title="${escapeHtml(url)}">
          <i class="${icon}"></i> ${label} <i class="ri-external-link-line" style="font-size:10px;opacity:0.7"></i>
        </a>
      </div>`;
    }
    
    const cleanP = escapeHtml(cleanSpaces(item));
    const isKnown = (ALL_CARTAS || []).some(x => normalize_doc_key(x.n_documento) === normalize_doc_key(item));
    if(isKnown){
      return `<div style="padding:3px 0;border-bottom:1px dashed var(--border)"><a href="javascript:void(0)" class="ref-link-chip" onclick="previewRefCartaDoc('${escapeHtml(item)}', event)" title="Ver carta citada: ${cleanP}"><i class="ri-git-commit-line"></i> <strong>${cleanP}</strong></a></div>`;
    }
    return `<div style="padding:3px 0;border-bottom:1px dashed var(--border);font-size:12.5px"><i class="ri-file-text-line" style="color:var(--text-muted);margin-right:4px"></i> ${cleanP}</div>`;
  }).join('') + `</div>`;
}

function syncRefAntecedentesField(){
  const el=document.getElementById('f_referencias');
  if(el)el.value=serializeReferenciasAntecedentes(refAntecedentesList);
}

function renderRefAntecedentesChips(){
  const box=document.getElementById('refAntecedentesChips');
  if(!box)return;
  box.innerHTML=refAntecedentesList.map((t,i)=>`
    <span class="ref-ant-chip" title="${escapeHtml(t)}">
      <span class="ref-ant-chip-text">${escapeHtml(t)}</span>
      <button type="button" class="ref-ant-chip-x" data-idx="${i}" aria-label="Quitar antecedente">&times;</button>
    </span>`).join('');
  box.querySelectorAll('.ref-ant-chip-x').forEach(btn=>{
    btn.onclick=()=>{
      refAntecedentesList.splice(+btn.dataset.idx,1);
      syncRefAntecedentesField();
      renderRefAntecedentesChips();
      debouncedUpdateRefTraceUI();
    };
  });
  debouncedUpdateRefTraceUI();
}

function loadRefAntecedentesFromField(){
  const el=document.getElementById('f_referencias');
  refAntecedentesList=parseReferenciasAntecedentes(el?.value||'');
  syncRefAntecedentesField();
  renderRefAntecedentesChips();
}

function addRefAntecedentesFromInput(raw){
  const parts=parseReferenciasAntecedentes(raw);
  if(!parts.length){
    const t=String(raw||'').replace(/\s+/g,' ').trim();
    if(t.length>=3)parts.push(t);
  }
  if(!parts.length)return false;
  const seen=new Set(refAntecedentesList.map(x=>x.toLowerCase()));
  let added=0;
  parts.forEach(p=>{
    const k=p.toLowerCase();
    if(!seen.has(k)){seen.add(k);refAntecedentesList.push(p);added++;}
  });
  if(added){
    syncRefAntecedentesField();
    renderRefAntecedentesChips();
    debouncedUpdateRefTraceUI();
  }
  return added>0;
}

let refAntSuggestTimer=null;
function updateRefAntPendingHint(){
  const inp=document.getElementById('refAntecedentesInput');
  const hint=document.getElementById('refAntPending');
  if(!inp||!hint)return;
  hint.classList.toggle('visible',!!inp.value.trim()&&!inp.value.includes('\n'));
}
function hideRefAntSuggest(){
  const box=document.getElementById('refAntSuggest');
  if(box){box.classList.remove('open');box.innerHTML='';}
}
function searchCartasForAntecedente(q){
  const term=String(q||'').trim().toLowerCase();
  if(term.length<2)return [];
  const norm=term.replace(/n[°º.]/g,'').replace(/[\/\-_]/g,' ').replace(/\s+/g,' ');
  const curId=editingId;
  const hits=[];
  ALL_CARTAS.forEach(c=>{
    if(curId&&c.id===curId)return;
    const doc=c.n_documento||'';
    const blob=[doc,c.referencia||'',c.asunto||''].join(' ').toLowerCase();
    const blobNorm=blob.replace(/n[°º.]/g,'').replace(/[\/\-_]/g,' ').replace(/\s+/g,' ');
    if(blob.includes(term)||blobNorm.includes(norm))hits.push(c);
  });
  hits.sort((a,b)=>{
    const da=(a.n_documento||'').toLowerCase();
    const db=(b.n_documento||'').toLowerCase();
    const aDoc=da.startsWith(term)?0:1;
    const bDoc=db.startsWith(term)?0:1;
    if(aDoc!==bDoc)return aDoc-bDoc;
    return da.localeCompare(db);
  });
  return hits.slice(0,8);
}
function renderRefAntSuggest(){
  const inp=document.getElementById('refAntecedentesInput');
  const box=document.getElementById('refAntSuggest');
  if(!inp||!box)return;
  const q=inp.value.trim();
  updateRefAntPendingHint();
  if(q.length<2){hideRefAntSuggest();return;}
  const hits=searchCartasForAntecedente(q);
  if(!hits.length){hideRefAntSuggest();return;}
  box.classList.add('open');
  box.innerHTML=hits.map(c=>`
    <button type="button" class="ref-ant-suggest-btn" data-cid="${c.id}" role="option">
      <span>${escapeHtml(c.n_documento||('ID '+c.id))}</span>
      <small>${escapeHtml(c.estado_norm||c.estado||'')} · ${escapeHtml(fmtDate(c.fecha)||'—')}</small>
    </button>`).join('');
  box.querySelectorAll('.ref-ant-suggest-btn').forEach(btn=>{
    btn.onclick=()=>{
      const c=ALL_CARTAS.find(x=>x.id===+btn.dataset.cid);
      addRefAntecedentesFromInput(c?.n_documento||'');
      inp.value='';
      hideRefAntSuggest();
      updateRefAntPendingHint();
      inp.focus();
    };
  });
}
function debouncedRefAntSuggest(){
  clearTimeout(refAntSuggestTimer);
  refAntSuggestTimer=setTimeout(renderRefAntSuggest,120);
}

function normalizeRefDocKey(raw){
  return String(raw||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/n[°º.]/g,' n ')
    .replace(/\./g,'')
    .replace(/[\/\-_]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function docKeysFromAntecedente(tok){
  const keys=[];
  const seen=new Set();
  const add=s=>{
    const k=normalizeRefDocKey(s);
    if(k.length<6||seen.has(k))return;
    seen.add(k);
    keys.push(k);
  };
  REF_ANT_DOC_RE.lastIndex=0;
  let m;
  while((m=REF_ANT_DOC_RE.exec(tok))!==null)add(m[0]);
  if(!keys.length){
    const t=String(tok||'').replace(/\s+/g,' ').trim();
    if(t.length>=10)add(t);
  }
  return keys;
}

function cartaMatchesAntecedenteKey(c, searchKeys){
  const docKey=normalizeRefDocKey(c.n_documento);
  if(!docKey||!searchKeys.length)return false;
  return searchKeys.some(k=>{
    if(!k||k.length<6)return false;
    if(docKey===k)return true;
    if(k.length>=10&&docKey.includes(k))return true;
    if(docKey.length>=10&&k.includes(docKey))return true;
    return false;
  });
}

function debouncedUpdateRefTraceUI(){
  clearTimeout(refTraceTimer);
  refTraceTimer=setTimeout(updateRefTraceUI,140);
}

function resolveHiloFkBanner(matched,currentId){
  const hiloIds=new Set();
  if(currentId!=null){
    const cur=ALL_CARTAS.find(c=>c.id===currentId);
    if(cur&&cur.hilo_id!=null)hiloIds.add(+cur.hilo_id);
  }
  (matched||[]).forEach(m=>{
    const c=ALL_CARTAS.find(x=>x.id===m.id);
    if(c&&c.hilo_id!=null)hiloIds.add(+c.hilo_id);
  });
  if(!hiloIds.size)return null;
  if(hiloIds.size>1){
    return {warn:true,text:'Los antecedentes pertenecen a hilos distintos; al guardar el sistema los unificará en un solo hilo (FK).'};
  }
  const hid=[...hiloIds][0];
  const siblings=ALL_CARTAS.filter(c=>+c.hilo_id===hid);
  const hiloFromApi=(HILOS?.hilos||[]).find(h=>+h.hilo_id===hid);
  const titulo=(hiloFromApi&&hiloFromApi.titulo)||(siblings[0]&&inferHiloTitulo(siblings))||('Hilo #'+hid);
  const clave=(hiloFromApi&&hiloFromApi.clave)||'';
  return {hid,titulo,n:siblings.length,clave,warn:false};
}

function inferHiloTitulo(cartas){
  if(!cartas||!cartas.length)return '';
  for(const c of cartas){
    const a=String(c.asunto||'');
    const m=a.match(/consulta\s*n[°º.]?\s*(\d+)/i);
    if(m)return 'Consulta N°'+m[1];
  }
  const d=cartas[0].n_documento;
  return d?String(d).slice(0,80):'';
}

function hiloFkBannerHtml(b){
  if(!b)return '';
  if(b.warn){
    return `<div class="hilo-fk-banner warn" style="font-size:11px;background:#FFF8E6;border:1px solid #E8D4A0;color:#6B5A2E;padding:8px 10px;border-radius:6px;margin-bottom:8px;line-height:1.45">
      <i class="ri-git-merge-line"></i> ${escapeHtml(b.text)}
    </div>`;
  }
  const claveTxt=b.clave?` · ${escapeHtml(b.clave)}`:'';
  return `<div class="hilo-fk-banner" style="font-size:11px;background:#EEF6FF;border:1px solid #B8D4F0;color:#1A4A7A;padding:8px 10px;border-radius:6px;margin-bottom:8px;line-height:1.45">
    <i class="ri-mail-thread-line"></i> <strong>Hilo vinculado (FK #${b.hid})</strong>${claveTxt}: ${escapeHtml(b.titulo)} · ${b.n} carta${b.n===1?'':'s'} en el mismo trámite. No se mezclará con otros hilos.
  </div>`;
}

function updateRefTraceUI(){
  const container=document.getElementById('refTraceLinksContainer');
  if(!container)return;
  syncRefAntecedentesField();
  const refVal=(document.getElementById('f_referencias')?.value||'').trim();
  const currentDoc=(document.getElementById('f_n_documento')?.value||'').trim();
  const currentId=editingId;

  if(!refVal&&!currentDoc){
    container.style.display='none';
    container.innerHTML='';
    const sumSalida=document.getElementById('csum_salida_text');
    if(sumSalida)sumSalida.textContent='—';
    return;
  }

  const rawParts=parseReferenciasAntecedentes(refVal);
  const searchKeys=[];
  const seenKeys=new Set();
  rawParts.forEach(part=>{
    docKeysFromAntecedente(part).forEach(k=>{
      if(!seenKeys.has(k)){seenKeys.add(k);searchKeys.push(k);}
    });
  });

  const matched=[];
  const seenIds=new Set();
  if(currentId)seenIds.add(currentId);

  if(searchKeys.length){
    ALL_CARTAS.forEach(c=>{
      if(seenIds.has(c.id))return;
      if(!cartaMatchesAntecedenteKey(c,searchKeys))return;
      seenIds.add(c.id);
      const isOut=c.sentido==='emitida'||String(c.bandeja||'').startsWith('emitida');
      matched.push({
        id:c.id,
        doc:c.n_documento||('ID '+c.id),
        bandeja:bandejaLabel(c.bandeja),
        sentido:isOut?'emitida':'recibida',
        fecha:fmtDate(c.fecha)||'Sin fecha',
        estado:c.estado_norm||c.estado||'—',
        asunto:c.asunto||'',
        especialidad:c.especialidad_norm||c.especialidad||'—'
      });
    });
  }

  const sumSalida=document.getElementById('csum_salida_text');
  if(sumSalida){
    const outs=matched.filter(m=>m.sentido==='emitida');
    if(outs.length){
      sumSalida.innerHTML=outs.map(o=>`📤 Salió con: <strong>${escapeHtml(o.doc)}</strong> (${escapeHtml(o.fecha)}) · <span class="status-badge ${estadoBadgeClass(o.estado)}" style="font-size:10px;padding:1px 5px">${escapeHtml(o.estado)}</span>`).join('<br>');
    }else{
      const ins=matched.filter(m=>m.sentido==='recibida');
      if(ins.length){
        sumSalida.innerHTML=ins.map(i=>`📥 Antecedente / Responde a: <strong>${escapeHtml(i.doc)}</strong> (${escapeHtml(i.fecha)})`).join('<br>');
      }else{
        sumSalida.textContent=refVal||'—';
      }
    }
  }

  if(!matched.length){
    const soloHilo=resolveHiloFkBanner([],currentId);
    if(soloHilo&&!soloHilo.warn){
      container.style.display='block';
      container.innerHTML=hiloFkBannerHtml(soloHilo)+`
        <div style="font-size:11px;color:var(--text-muted);padding:2px 4px">Esta carta ya pertenece a un hilo persistente. Agrega antecedentes para enlazar respuestas al mismo trámite.</div>`;
      return;
    }
    if(refVal.length>=4){
      container.style.display='block';
      const noKeyMsg=rawParts.length&&!searchKeys.length
        ? ' Los antecedentes no tienen un N° reconocible (CARTA N°, INFORME N°, etc.). Usa el N° completo.'
        : '';
      container.innerHTML=`
        <div style="font-size:11px;color:var(--text-muted);background:#F8F7F4;border:1px dashed #E8E4DC;padding:6px 10px;border-radius:6px">
          <i class="ri-information-line"></i> Referencia registrada: <strong>${escapeHtml(formatReferenciasAntecedentes(refVal))}</strong>.${noKeyMsg} (Se enlazará cuando el N° coincida con una carta en el sistema).
        </div>`;
    }else{
      container.style.display='none';
      container.innerHTML='';
    }
    return;
  }

  container.style.display='flex';
  const MAX_TRACE=12;
  const shown=matched.slice(0,MAX_TRACE);
  const extra=matched.length-shown.length;
  const hiloBanner=hiloFkBannerHtml(resolveHiloFkBanner(matched,currentId));
  container.innerHTML=hiloBanner+`
    <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-top:4px;margin-bottom:2px;display:flex;align-items:center;gap:4px;flex-wrap:wrap">
      <i class="ri-link-m" style="color:var(--accent)"></i> Trazabilidad Detectada (${matched.length} documento${matched.length>1?'s':''}):
      ${extra>0?`<span style="font-weight:500;color:var(--text-muted)">mostrando ${shown.length}</span>`:''}
    </div>
    ${shown.map(m=>`
      <div class="ref-trace-card">
        <div class="ref-trace-info">
          <span class="ref-trace-tag ${m.sentido==='emitida'?'out':'in'}">
            ${m.sentido==='emitida'?'📤 SALIÓ EN':'📥 ENTRÓ EN'}
          </span>
          <span class="ref-trace-doc" title="${escapeHtml(m.asunto)}">${escapeHtml(m.doc)}</span>
          <span class="ref-trace-meta">· ${escapeHtml(m.fecha)} · <span class="status-badge ${estadoBadgeClass(m.estado)}" style="font-size:10px;padding:1px 5px">${escapeHtml(m.estado)}</span></span>
        </div>
        <button type="button" class="btn-jump-ref" onclick="previewRefCarta(${m.id})" title="Ver detalles completos de esta carta">
          <i class="ri-eye-line"></i> Ver
        </button>
      </div>
    `).join('')}
    ${extra>0?`<div style="font-size:11px;color:var(--text-muted);padding:2px 4px">+ ${extra} documento${extra>1?'s':''} más. Si la lista es incorrecta, revisa que cada chip tenga el N° completo.</div>`:''}
  `;
}

document.getElementById('f_n_documento')?.addEventListener('input',debouncedUpdateRefTraceUI);
document.getElementById('refAntecedentesAddBtn')?.addEventListener('click',()=>{
  const inp=document.getElementById('refAntecedentesInput');
  if(!inp)return;
  const ok=addRefAntecedentesFromInput(inp.value);
  if(!ok&&inp.value.trim())showToast('Escribe al menos 3 caracteres o el N° completo del documento','error');
  else if(ok){inp.value='';hideRefAntSuggest();updateRefAntPendingHint();inp.focus();}
});
document.getElementById('refAntecedentesInput')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();document.getElementById('refAntecedentesAddBtn')?.click();}
  if(e.key==='Escape')hideRefAntSuggest();
});
document.getElementById('refAntecedentesInput')?.addEventListener('input',()=>{
  debouncedRefAntSuggest();
  updateRefAntPendingHint();
});
document.getElementById('refAntecedentesInput')?.addEventListener('blur',()=>{
  setTimeout(hideRefAntSuggest,180);
});
document.getElementById('refAntecedentesInput')?.addEventListener('paste',e=>{
  const text=(e.clipboardData||window.clipboardData)?.getData('text')||'';
  if(!text||text.length<8)return;
  const parts=parseReferenciasAntecedentes(text);
  if(parts.length>1){
    e.preventDefault();
    addRefAntecedentesFromInput(text);
    e.target.value='';
  }
});
document.getElementById('excelFileInput')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if(!['xlsx', 'xlsm', 'xls'].includes(ext)){
    showToast('Formato no válido. Solo se admiten archivos Excel (.xlsx, .xlsm, .xls)', 'error');
    return;
  }
  selectedExcelFile = file;
  confirmAction = 'reimport_file';
  document.getElementById('confirmTitle').innerHTML = '<i class="ri-file-excel-2-fill" style="color:#107C41;font-size:20px"></i> ¿Confirmar Reimportación de Base de Datos?';
  document.getElementById('confirmMsg').innerHTML = `
    Has seleccionado el siguiente archivo Excel:<br>
    <div style="margin:12px 0;padding:12px 14px;background:#F8F9FA;border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;gap:10px;text-align:left">
      <i class="ri-file-excel-2-fill" style="color:#107C41;font-size:24px"></i>
      <div>
        <div style="font-weight:700;color:var(--text-primary);font-size:13px;word-break:break-all">${escapeHtml(file.name)}</div>
        <div style="font-size:11.5px;color:var(--text-muted)">Tamaño: ${(file.size / (1024*1024)).toFixed(2)} MB</div>
      </div>
    </div>
    <div style="padding:10px 12px;background:#FFF5F5;border-left:3px solid var(--rose);border-radius:4px;font-size:12px;color:var(--text-primary);line-height:1.45;margin-bottom:8px">
      <strong style="color:var(--rose)">⚠️ Advertencia:</strong> Toda la información de cartas anterior será reemplazada por los datos de este nuevo archivo. Los hilos de trámite se reconstruirán automáticamente.
    </div>
    <p style="margin:8px 0 0;font-size:12.5px;color:var(--text-secondary)">¿Deseas proceder con la reimportación?</p>`;
  const okBtn = document.getElementById('btnConfirmOk');
  if(okBtn){
    okBtn.disabled = false;
    okBtn.textContent = 'Sí, Proceder con la Reimportación';
    okBtn.className = 'btn-save';
    okBtn.style.background = 'var(--accent)';
  }
  const cancelBtn = document.getElementById('btnConfirmCancel');
  if(cancelBtn){
    cancelBtn.textContent = 'Cancelar';
  }
  document.getElementById('confirmOverlay').classList.add('active');
});

document.getElementById('btnReloadApp')?.addEventListener('click', () => {
  window.location.reload();
});

document.getElementById('btnConfirmCancel')?.addEventListener('click',closeConfirm);
document.getElementById('btnConfirmOk')?.addEventListener('click',handleConfirmOk);
document.getElementById('confirmOverlay')?.addEventListener('click',e=>{
  if(e.target.id==='confirmOverlay')closeConfirm();
});
document.getElementById('btnCSV')?.addEventListener('click',exportCSV);
document.getElementById('btnDownloadBackupExcel')?.addEventListener('click',downloadBackupExcel);
document.getElementById('btnReimportConfig')?.addEventListener('click',confirmReimport);
document.getElementById('btnGenerarDocxFromEdit')?.addEventListener('click',handleDownloadDocxFromEdit);
document.getElementById('filterFlujo')?.addEventListener('change',applyFilters);
document.getElementById('filterEstado')?.addEventListener('change',applyFilters);
document.getElementById('filterEsp')?.addEventListener('change',applyFilters);
document.getElementById('filterSemantica')?.addEventListener('change',applyFilters);
document.getElementById('filterPlazo')?.addEventListener('change',applyFilters);
document.getElementById('filterDeuda')?.addEventListener('change',applyFilters);
document.getElementById('filterContraparte')?.addEventListener('change',applyFilters);
document.getElementById('filterNaturaleza')?.addEventListener('change',applyFilters);
document.getElementById('filterQ')?.addEventListener('input',()=>{
  const val = document.getElementById('filterQ')?.value || '';
  const tableQ = document.getElementById('cartasTableQ');
  if(tableQ) tableQ.value = val;
  syncCartasSearchUI();
  clearTimeout(qTimer);
  qTimer=setTimeout(applyFilters,180);
});
document.getElementById('cartasTableQ')?.addEventListener('input',()=>{
  const val = document.getElementById('cartasTableQ')?.value || '';
  const fQ = document.getElementById('filterQ');
  if(fQ) fQ.value = val;
  syncCartasSearchUI();
  clearTimeout(qTimer);
  qTimer=setTimeout(applyFilters,180);
});
document.getElementById('cartasTableQClear')?.addEventListener('click',()=>{
  setCartasSearchQuery('');
  document.getElementById('cartasTableQ')?.focus();
});
document.getElementById('btnJumpPendientes')?.addEventListener('click',()=>applyPendienteToFilters(pendMode,pendActor,'all'));
document.querySelectorAll('#pendMode button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    applyPendSelection(btn.dataset.mode,'all',{focus:true,skipScroll:isPendDetailVisible()});
  });
});
document.querySelectorAll('#hiloFoco button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    hiloFoco=btn.dataset.foco||'operativo';
    hiloExpanded=null;
    document.querySelectorAll('#hiloFoco button').forEach(x=>x.classList.toggle('active',x.dataset.foco===hiloFoco));
    refreshHilosAsync();
  });
});
function pulseModalCard(overlayId){
  const card=document.querySelector(`#${overlayId} .modal-card`);
  if(!card)return;
  card.classList.remove('shake');
  void card.offsetWidth;
  card.classList.add('shake');
  setTimeout(()=>card.classList.remove('shake'),240);
}
document.getElementById('modalOverlay').addEventListener('click',e=>{
  if(e.target.id==='modalOverlay')pulseModalCard('modalOverlay');
});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(document.getElementById('confirmOverlay').classList.contains('active'))closeConfirm();
  else if(document.getElementById('userModalOverlay').classList.contains('active'))closeUserModal();
  else if(document.getElementById('modalOverlay').classList.contains('active'))closeModal();
  else if(!document.getElementById('pwdGate').classList.contains('hidden')&&!(CURRENT_USER&&CURRENT_USER.must_change_password))hidePwdGate();
});
function updateHeaderHeight(){
  const h = document.querySelector('.app-header')?.offsetHeight;
  if(h) document.documentElement.style.setProperty('--header-height', h + 'px');
}
window.addEventListener('scroll',()=>{
  document.getElementById('filterBar')?.classList.toggle('scrolled',window.scrollY>10);
  updateFloatingSearchOnScroll();
},{passive:true});
window.addEventListener('resize',()=>{
  updateHeaderHeight();
  updateFloatingSearchOnScroll();
  Object.values(charts).forEach(ch=>ch&&ch.resize());
});
window.openEditModal=openEditModal;window.confirmDelete=confirmDelete;

document.getElementById('loginForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const err=document.getElementById('loginError');
  const btn=document.getElementById('btnLogin');
  err.textContent='';

  const username=document.getElementById('loginUser').value.trim();
  const password=document.getElementById('loginPass').value;

  if(!username){
    err.textContent='Ingresa tu nombre de usuario';
    return;
  }
  if(username.length>60){
    err.textContent='El nombre de usuario no puede superar los 60 caracteres';
    return;
  }
  if(!password){
    err.textContent='Ingresa tu contraseña';
    return;
  }
  if(password.length>128){
    err.textContent='La contraseña no puede superar los 128 caracteres';
    return;
  }

  btn.disabled=true;
  btn.innerHTML='<i class="ri-loader-4-line spin" style="margin-right:6px"></i> Validando…';
  try{
    const r=await fetch('/api/auth/login',{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({username,password})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Credenciales inválidas');
    applyUserChrome(d.user);
    document.getElementById('loginPass').value='';
    if(d.user&&d.user.must_change_password){
      hideLoginGate();
      document.getElementById('pwdCurrent').value=password;
      showPwdGate();
      showToast('Por seguridad debes actualizar tu contraseña antes de continuar','info');
      return;
    }
    hidePwdGate();
    hideLoginGate();
    showToast('Bienvenido, '+(d.user.nombre||d.user.username),'success');
    await loadData();
  }catch(ex){err.textContent=ex.message||'Error';}
  finally{btn.disabled=false;btn.textContent='Entrar';}
});

document.getElementById('pwdForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  const err=document.getElementById('pwdError');
  const btn=document.getElementById('btnPwdSave');
  err.textContent='';

  const cur=document.getElementById('pwdCurrent').value;
  const n1=document.getElementById('pwdNew').value;
  const n2=document.getElementById('pwdNew2').value;

  if(!cur){
    err.textContent='Ingresa tu contraseña actual';
    return;
  }
  if(cur.length>128){
    err.textContent='La contraseña actual no puede superar los 128 caracteres';
    return;
  }
  if(!n1){
    err.textContent='Ingresa la nueva contraseña';
    return;
  }
  if(n1.length<8){
    err.textContent='La nueva contraseña debe tener al menos 8 caracteres';
    return;
  }
  if(n1.length>128){
    err.textContent='La nueva contraseña no puede superar los 128 caracteres';
    return;
  }
  if(/^[0-9]+$/.test(n1)||/^[a-zA-Z]+$/.test(n1)){
    err.textContent='La nueva contraseña debe combinar letras y números (o símbolos)';
    return;
  }
  if(cur===n1){
    err.textContent='La nueva contraseña debe ser diferente a la contraseña actual';
    return;
  }
  if(n1!==n2){
    err.textContent='La confirmación de la nueva contraseña no coincide';
    return;
  }

  btn.disabled=true;btn.textContent='Guardando…';
  try{
    const r=await fetch('/api/auth/change-password',{
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({current_password:cur,new_password:n1})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'No se pudo cambiar la contraseña');
    applyUserChrome(d.user);
    hidePwdGate();
    hideLoginGate();
    showToast('Contraseña actualizada correctamente','success');
    await loadData();
  }catch(ex){err.textContent=ex.message||'Error al cambiar contraseña';}
  finally{btn.disabled=false;btn.textContent='Guardar y continuar';}
});

const btnSidebarToggle=document.getElementById('btnSidebarToggle');
const btnSidebarClose=document.getElementById('btnSidebarClose');
const sidebarBackdrop=document.getElementById('sidebarBackdrop');
const appSidebar=document.getElementById('appSidebar');

function isMobileScreen(){
  return window.innerWidth <= 992;
}

function toggleSidebar(){
  if(isMobileScreen()){
    if(appSidebar?.classList.contains('open')){
      closeMobileSidebar();
    }else{
      openMobileSidebar();
    }
  }else{
    const isCollapsed = appSidebar?.classList.toggle('collapsed');
    try{
      localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
    }catch(_){}
    setTimeout(()=>{
      window.dispatchEvent(new Event('resize'));
      updateHeaderHeight();
      Object.values(charts).forEach(ch=>ch&&ch.resize&&ch.resize());
    }, 260);
  }
}

function openMobileSidebar(){
  appSidebar?.classList.remove('collapsed');
  appSidebar?.classList.add('open');
  sidebarBackdrop?.classList.add('active');
}
function closeMobileSidebar(){
  appSidebar?.classList.remove('open');
  sidebarBackdrop?.classList.remove('active');
}

btnSidebarToggle?.addEventListener('click',toggleSidebar);
btnSidebarClose?.addEventListener('click',closeMobileSidebar);
sidebarBackdrop?.addEventListener('click',closeMobileSidebar);

document.getElementById('btnChangePwd')?.addEventListener('click',()=>{
  document.getElementById('pwdCurrent').value='';
  showPwdGate(true);
});
document.getElementById('btnPwdCancel')?.addEventListener('click',()=>hidePwdGate());
document.getElementById('pwdGate')?.addEventListener('click',e=>{
  if(e.target.id==='pwdGate'&&!(CURRENT_USER&&CURRENT_USER.must_change_password)){
    hidePwdGate();
  }
});
document.getElementById('btnUsersAdmin')?.addEventListener('click',()=>showView('usuarios'));
document.getElementById('btnUsersRefresh')?.addEventListener('click',()=>loadUsersAdmin());
document.getElementById('btnUserNew')?.addEventListener('click',()=>openUserModal(null));
document.getElementById('btnUserCancel')?.addEventListener('click',()=>closeUserModal());
document.getElementById('userModalClose')?.addEventListener('click',()=>closeUserModal());
document.getElementById('userModalOverlay')?.addEventListener('click',e=>{
  if(e.target.id==='userModalOverlay')pulseModalCard('userModalOverlay');
});
document.getElementById('refPreviewOverlay')?.addEventListener('click',e=>{
  if(e.target.id==='refPreviewOverlay')closeRefPreview();
});
document.getElementById('btnUserSave')?.addEventListener('click',handleUserSave);
document.getElementById('uf_rol')?.addEventListener('change',syncUserFormRol);

