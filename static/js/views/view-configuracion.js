
function updateDocumentTitle(view = currentView) {
  const appName = (SYSTEM_CONFIG && SYSTEM_CONFIG.nombre_sistema) || 'SistemaGreace';
  const viewNames = {
    reportes: 'Reportes',
    pendientes: 'Pendientes',
    saldos: 'Resumen de Saldos',
    cartas: 'Cartas',
    usuarios: 'Usuarios',
    configuracion: 'Configuración'
  };
  document.title = `${viewNames[view] || 'Panel'} · ${appName}`;
}

function applyConfig(cfg) {
  if (!cfg) return;
  SYSTEM_CONFIG = cfg;
  try {
    localStorage.setItem('cached_system_config', JSON.stringify(cfg));
  } catch(e) {}
  
  // 1. Título dinámico de la pestaña del navegador
  updateDocumentTitle(currentView);
  
  // 2. Favicon de la pestaña
  const favEl = document.getElementById('appFavicon');
  if (favEl) {
    if (cfg.favicon_url) {
      favEl.href = cfg.favicon_url;
    } else {
      favEl.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23C45B3E'><path d='M21 3C21.5523 3 22 3.44772 22 4V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V19H20V7.3L12 14.5L2 5.5V4C2 3.44772 2.44772 3 3 3H21ZM8 15V17H0V15H8ZM5 10V12H0V10H5ZM19.5659 5H4.43414L12 11.8093L19.5659 5Z'></path></svg>";
    }
  }
  
  // 3. Nombre y Subtítulo en la Barra Lateral
  const sTitle = document.getElementById('sidebarBrandTitle');
  if (sTitle) sTitle.textContent = cfg.nombre_sistema || 'SistemaGreace';
  const sSub = document.getElementById('sidebarBrandBadge');
  if (sSub) sSub.textContent = cfg.subtitulo_proyecto || 'Hospital Leoncio Prado';
  
  // 4. Logo en la Barra Lateral
  const sLogo = document.getElementById('sidebarBrandLogo');
  if (sLogo) {
    sLogo.title = cfg.nombre_sistema || 'SistemaGreace';
    if (cfg.logo_url) {
      sLogo.innerHTML = `<img src="${cfg.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:9px;display:block">`;
      sLogo.style.background = 'transparent';
      sLogo.style.boxShadow = 'none';
    } else {
      sLogo.innerHTML = '<i class="ri-mail-check-line"></i>';
      sLogo.style.background = '';
      sLogo.style.boxShadow = '';
    }
  }

  // 5. Branding en Pantalla de Login
  const lTitle = document.getElementById('loginCardTitle');
  if (lTitle) lTitle.textContent = cfg.nombre_sistema || 'SistemaGreace';
  const lSub = document.getElementById('loginCardSub');
  if (lSub) lSub.textContent = cfg.subtitulo_proyecto || 'Control y Gestión de Cartas HLP';
  const lLogo = document.getElementById('loginCardLogo');
  if (lLogo) {
    if (cfg.logo_url) {
      lLogo.innerHTML = `<img src="${cfg.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:10px;display:block">`;
      lLogo.style.background = 'transparent';
      lLogo.style.boxShadow = 'none';
    } else {
      lLogo.innerHTML = '<i class="ri-mail-check-line"></i>';
      lLogo.style.background = 'var(--accent)';
      lLogo.style.boxShadow = '0 4px 12px rgba(196,91,62,.25)';
    }
  }

  // 6. Branding en Pantalla de Splash
  const spTitle = document.getElementById('appSplashTitle');
  if (spTitle) spTitle.textContent = cfg.nombre_sistema || 'SistemaGreace';
  const spSub = document.getElementById('appSplashSub');
  if (spSub) spSub.textContent = cfg.subtitulo_proyecto || 'Hospital Leoncio Prado';
  const spLogo = document.getElementById('appSplashLogo');
  if (spLogo) {
    if (cfg.logo_url) {
      spLogo.innerHTML = `<img src="${cfg.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:10px;display:block">`;
      spLogo.style.background = 'transparent';
      spLogo.style.boxShadow = 'none';
    } else {
      spLogo.innerHTML = '<i class="ri-mail-check-line"></i>';
      spLogo.style.background = '';
    }
  }

  // 7. Pie de página
  const foot = document.querySelector('.footer > span:first-child');
  if (foot) foot.textContent = `Fuente: Control de Cartas — ${cfg.subtitulo_proyecto || 'Leoncio Prado (PRONIS/MINSA)'}`;

  // 8. Reglas de Plazos SLA (unificado con contractuales)
  applyPlazoContractualConfig(cfg);
  if (cfg.plazo_ro_dias != null) HILO_PLAZO_DIAS = parseInt(cfg.plazo_ro_dias, 10);
  else if (cfg.dias_hilo != null) HILO_PLAZO_DIAS = parseInt(cfg.dias_hilo, 10);
  if (cfg.dias_vencida != null) VENCIDA_DIAS = parseInt(cfg.dias_vencida, 10);
  if (cfg.dias_por_vencer != null) POR_VENCER_DIAS = parseInt(cfg.dias_por_vencer, 10);
  const fV = document.getElementById('footerVencida');
  if (fV) fV.textContent = VENCIDA_DIAS;
  const fR = document.getElementById('footerRiesgo');
  if (fR) fR.textContent = POR_VENCER_DIAS;
  const ov = document.getElementById('optPlazoVencida');
  const or_ = document.getElementById('optPlazoRiesgo');
  const ok = document.getElementById('optPlazoOk');
  if (ov) ov.textContent = `Vencidas (≥${VENCIDA_DIAS}d abiertas)`;
  if (or_) or_.textContent = `Por vencer (≥${POR_VENCER_DIAS}d)`;
  if (ok) ok.textContent = `En gestión (<${POR_VENCER_DIAS}d)`;
}

async function fetchConfig() {
  try {
    const r = await fetch('/api/config', { credentials: 'same-origin' });
    if (!r.ok) return;
    const d = await r.json();
    if (d && d.config) {
      applyConfig(d.config);
    }
  } catch (e) {
    console.warn('fetchConfig error', e);
  }
}

function validateAndProcessImage(file, maxBytes, allowedMimes, allowedExts, labelName, onDone) {
  if (!file) return;
  
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const validExt = allowedExts.includes('.' + ext) || allowedExts.includes(ext);
  const validMime = allowedMimes.some(m => mime === m || mime.includes(m.replace('image/', '')));

  if (!validExt && !validMime) {
    const extList = allowedExts.map(e => e.replace('.', '').toUpperCase()).join(', ');
    showToast(`Formato no permitido para ${labelName}. Restricciones: Solo se admiten archivos ${extList}.`, 'error');
    return;
  }
  
  if (file.size > maxBytes) {
    const sizeStr = file.size >= 1048576 
      ? (file.size / (1024 * 1024)).toFixed(2) + ' MB'
      : (file.size / 1024).toFixed(0) + ' KB';
    const limitStr = maxBytes >= 1048576 
      ? (maxBytes / (1024 * 1024)).toFixed(1) + ' MB'
      : (maxBytes / 1024).toFixed(0) + ' KB';
    showToast(`El archivo excede el tamaño máximo para ${labelName} (Límite estricto: ${limitStr}). Tu archivo pesa ${sizeStr}.`, 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    onDone(e.target.result, file);
  };
  reader.onerror = () => {
    showToast(`Error al procesar el archivo de ${labelName}. Intenta con otra imagen.`, 'error');
  };
  reader.readAsDataURL(file);
}

let initialConfigSnapshot = null;

function checkConfigChanges() {
  const curNombre = (document.getElementById('cfg_nombre_sistema')?.value || '').trim();
  const curSub = (document.getElementById('cfg_subtitulo_proyecto')?.value || '').trim();
  const curPlazoSup = parseInt(document.getElementById('cfg_plazo_sup_dias')?.value || 5, 10);
  const curPlazoEnt = parseInt(document.getElementById('cfg_plazo_entidad_dias')?.value || 15, 10);
  const curPlazoMuni = parseInt(document.getElementById('cfg_plazo_muni_dias')?.value || 15, 10);
  const curPlazoJrd = parseInt(document.getElementById('cfg_plazo_jrd_dias')?.value || 15, 10);
  const curPlazoRo = parseInt(document.getElementById('cfg_plazo_ro_dias')?.value || 5, 10);
  
  const isDirty = !initialConfigSnapshot ||
    curNombre !== initialConfigSnapshot.nombre_sistema ||
    curSub !== initialConfigSnapshot.subtitulo_proyecto ||
    pendingLogoBase64 !== initialConfigSnapshot.logo_url ||
    pendingFaviconBase64 !== initialConfigSnapshot.favicon_url ||
    pendingBannerWordBase64 !== initialConfigSnapshot.logo_membrete_word ||
    curPlazoSup !== initialConfigSnapshot.plazo_sup_dias ||
    curPlazoEnt !== initialConfigSnapshot.plazo_entidad_dias ||
    curPlazoMuni !== initialConfigSnapshot.plazo_muni_dias ||
    curPlazoJrd !== initialConfigSnapshot.plazo_jrd_dias ||
    curPlazoRo !== initialConfigSnapshot.plazo_ro_dias;

  const btnSave = document.getElementById('btnConfigSave');
  const bChanges = document.getElementById('cfg_changes_badge');
  const bSaved = document.getElementById('cfg_saved_badge');

  if (btnSave) {
    btnSave.disabled = !isDirty;
    if (isDirty) {
      btnSave.style.opacity = '1';
      btnSave.style.cursor = 'pointer';
      btnSave.style.pointerEvents = 'auto';
      btnSave.style.boxShadow = '0 2px 8px rgba(196,91,62,.35)';
    } else {
      btnSave.style.opacity = '0.5';
      btnSave.style.cursor = 'not-allowed';
      btnSave.style.pointerEvents = 'none';
      btnSave.style.boxShadow = 'none';
    }
  }
  if (bChanges) bChanges.style.display = isDirty ? 'inline-flex' : 'none';
  if (bSaved) bSaved.style.display = isDirty ? 'none' : 'inline-flex';
}

function loadConfigAdmin() {
  if (!(CURRENT_USER && CURRENT_USER.can_manage_users)) return;
  const cfg = SYSTEM_CONFIG || {
    nombre_sistema: 'SistemaGreace',
    subtitulo_proyecto: 'Hospital Leoncio Prado (PRONIS/MINSA)',
    dias_vencida: 15,
    dias_por_vencer: 10,
    dias_hilo: 5,
    plazo_sup_dias: 5,
    plazo_entidad_dias: 15,
    plazo_muni_dias: 15,
    plazo_jrd_dias: 15,
    plazo_ro_dias: 5
  };
  
  document.getElementById('cfg_nombre_sistema').value = cfg.nombre_sistema || '';
  document.getElementById('cfg_subtitulo_proyecto').value = cfg.subtitulo_proyecto || '';
  document.getElementById('cfg_plazo_sup_dias').value = cfg.plazo_sup_dias ?? 5;
  document.getElementById('cfg_plazo_entidad_dias').value = cfg.plazo_entidad_dias ?? 15;
  document.getElementById('cfg_plazo_muni_dias').value = cfg.plazo_muni_dias ?? 15;
  document.getElementById('cfg_plazo_jrd_dias').value = cfg.plazo_jrd_dias ?? 15;
  document.getElementById('cfg_plazo_ro_dias').value = cfg.plazo_ro_dias ?? 5;
  syncUnifiedPlazoUI();
  
  pendingLogoBase64 = cfg.logo_url || null;
  pendingFaviconBase64 = cfg.favicon_url || null;
  pendingBannerWordBase64 = cfg.logo_membrete_word || null;
  
  initialConfigSnapshot = {
    nombre_sistema: (cfg.nombre_sistema || '').trim(),
    subtitulo_proyecto: (cfg.subtitulo_proyecto || '').trim(),
    logo_url: cfg.logo_url || null,
    favicon_url: cfg.favicon_url || null,
    logo_membrete_word: cfg.logo_membrete_word || null,
    plazo_sup_dias: parseInt(cfg.plazo_sup_dias ?? 5, 10),
    plazo_entidad_dias: parseInt(cfg.plazo_entidad_dias ?? 15, 10),
    plazo_muni_dias: parseInt(cfg.plazo_muni_dias ?? 15, 10),
    plazo_jrd_dias: parseInt(cfg.plazo_jrd_dias ?? 15, 10),
    plazo_ro_dias: parseInt(cfg.plazo_ro_dias ?? 5, 10)
  };
  
  updateLogoPreviewUI(pendingLogoBase64);
  updateFaviconPreviewUI(pendingFaviconBase64);
  updateBannerWordPreviewUI(pendingBannerWordBase64);
  updateTabPreviewUI();
  checkConfigChanges();
}

function updateLogoPreviewUI(url) {
  const prev = document.getElementById('cfg_logo_preview');
  const info = document.getElementById('cfg_logo_info');
  const btnRem = document.getElementById('btnRemoveLogo');
  if (url) {
    prev.innerHTML = `<img src="${url}" alt="Preview" style="width:100%;height:100%;object-fit:contain">`;
    prev.style.background = '#FFFFFF';
    prev.style.border = '1px solid var(--border)';
    info.textContent = 'Logo personalizado cargado';
    if (btnRem) btnRem.style.display = 'inline-flex';
  } else {
    prev.innerHTML = '<i class="ri-mail-check-line"></i>';
    prev.style.background = 'var(--accent)';
    prev.style.border = 'none';
    info.textContent = 'Ícono por defecto (SistemaGreace)';
    if (btnRem) btnRem.style.display = 'none';
  }
}

function updateFaviconPreviewUI(url) {
  const prev = document.getElementById('cfg_favicon_preview');
  const btnRem = document.getElementById('btnRemoveFavicon');
  if (url) {
    prev.innerHTML = `<img src="${url}" alt="Favicon" style="width:100%;height:100%;object-fit:contain">`;
    if (btnRem) btnRem.style.display = 'inline-flex';
  } else {
    prev.innerHTML = '<i class="ri-mail-check-line" style="color:#FFFFFF;font-size:13px"></i>';
    if (btnRem) btnRem.style.display = 'none';
  }
}

function updateBannerWordPreviewUI(url) {
  const prev = document.getElementById('cfg_banner_word_preview');
  const info = document.getElementById('cfg_banner_word_info');
  const btnRem = document.getElementById('btnRemoveBannerWord');
  if (!prev) return;
  if (url) {
    prev.innerHTML = `<img src="${url}" alt="Membrete Word" style="width:100%;height:100%;object-fit:contain;display:block">`;
    if (info) info.textContent = 'Membrete personalizado activo';
    if (btnRem) btnRem.style.display = 'inline-flex';
  } else {
    prev.innerHTML = `<img src="cggc_banner.png" alt="Membrete CGGC" onerror="this.parentElement.innerHTML='<span style=\\'font-size:11px;color:var(--text-muted)\\'>Membrete institucional CGGC por defecto</span>'" style="width:100%;height:100%;object-fit:contain;display:block">`;
    if (info) info.textContent = 'Membrete oficial por defecto (CGGC)';
    if (btnRem) btnRem.style.display = 'none';
  }
}

function updateTabPreviewUI() {
  const name = document.getElementById('cfg_nombre_sistema')?.value.trim() || 'SistemaGreace';
  const tabEl = document.getElementById('cfg_tab_title_preview');
  if (tabEl) tabEl.textContent = `Reportes · ${name}`;
}

// Event Listeners for Configuration
document.getElementById('btnUploadLogo')?.addEventListener('click', () => {
  document.getElementById('cfg_logo_input')?.click();
});
document.getElementById('cfg_logo_input')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  validateAndProcessImage(
    file,
    1572864, // 1.5 MB
    ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
    'el Logo',
    (base64) => {
      pendingLogoBase64 = base64;
      updateLogoPreviewUI(base64);
      checkConfigChanges();
      showToast('Logo cargado. Guarda los cambios para aplicar.', 'info');
    }
  );
  e.target.value = '';
});
document.getElementById('btnRemoveLogo')?.addEventListener('click', () => {
  pendingLogoBase64 = null;
  updateLogoPreviewUI(null);
  checkConfigChanges();
  showToast('Logo removido. Volverá al ícono por defecto al guardar.', 'info');
});

document.getElementById('btnUploadFavicon')?.addEventListener('click', () => {
  document.getElementById('cfg_favicon_input')?.click();
});
document.getElementById('cfg_favicon_input')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  validateAndProcessImage(
    file,
    262144, // 256 KB
    ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml', 'image/ico'],
    ['.ico', '.png', '.svg'],
    'el Favicon',
    (base64) => {
      pendingFaviconBase64 = base64;
      updateFaviconPreviewUI(base64);
      checkConfigChanges();
      showToast('Favicon cargado. Guarda los cambios para aplicar.', 'info');
    }
  );
  e.target.value = '';
});
document.getElementById('btnRemoveFavicon')?.addEventListener('click', () => {
  pendingFaviconBase64 = null;
  updateFaviconPreviewUI(null);
  checkConfigChanges();
  showToast('Favicon removido. Volverá al ícono por defecto al guardar.', 'info');
});

document.getElementById('btnUploadBannerWord')?.addEventListener('click', () => {
  document.getElementById('cfg_banner_word_input')?.click();
});
document.getElementById('cfg_banner_word_input')?.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  validateAndProcessImage(
    file,
    2621440, // 2.5 MB
    ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    ['.png', '.jpg', '.jpeg', '.webp', '.svg'],
    'el Membrete Word',
    (base64) => {
      pendingBannerWordBase64 = base64;
      updateBannerWordPreviewUI(base64);
      checkConfigChanges();
      showToast('Membrete Word cargado. Guarda los cambios para aplicar.', 'info');
    }
  );
  e.target.value = '';
});
document.getElementById('btnRemoveBannerWord')?.addEventListener('click', () => {
  pendingBannerWordBase64 = null;
  updateBannerWordPreviewUI(null);
  checkConfigChanges();
  showToast('Membrete Word restaurado al oficial por defecto. Guarda los cambios.', 'info');
});

['cfg_nombre_sistema','cfg_subtitulo_proyecto','cfg_plazo_sup_dias','cfg_plazo_entidad_dias','cfg_plazo_muni_dias','cfg_plazo_jrd_dias','cfg_plazo_ro_dias'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', () => {
      if (id === 'cfg_nombre_sistema') updateTabPreviewUI();
      if (['cfg_plazo_sup_dias','cfg_plazo_entidad_dias','cfg_plazo_muni_dias','cfg_plazo_jrd_dias','cfg_plazo_ro_dias'].includes(id)) {
        syncUnifiedPlazoUI();
      } else {
        checkConfigChanges();
      }
    });
    el.addEventListener('change', () => {
      if (['cfg_plazo_sup_dias','cfg_plazo_entidad_dias','cfg_plazo_muni_dias','cfg_plazo_jrd_dias','cfg_plazo_ro_dias'].includes(id)) {
        syncUnifiedPlazoUI();
      } else {
        checkConfigChanges();
      }
    });
  }
});

document.getElementById('btnConfigSave')?.addEventListener('click', handleConfigSave);
document.getElementById('btnConfigReset')?.addEventListener('click', handleConfigReset);

async function handleConfigSave() {
  syncUnifiedPlazoUI();
  const nombre = document.getElementById('cfg_nombre_sistema').value.trim();
  const subtitulo = document.getElementById('cfg_subtitulo_proyecto').value.trim();
  const derived = computeDerivedPlazosFromContractual();
  const dias_vencida = derived.dias_vencida;
  const dias_por_vencer = derived.dias_por_vencer;
  const dias_hilo = derived.dias_hilo;
  const plazo_sup_dias = parseInt(document.getElementById('cfg_plazo_sup_dias').value, 10);
  const plazo_entidad_dias = parseInt(document.getElementById('cfg_plazo_entidad_dias').value, 10);
  const plazo_muni_dias = parseInt(document.getElementById('cfg_plazo_muni_dias').value, 10);
  const plazo_jrd_dias = parseInt(document.getElementById('cfg_plazo_jrd_dias').value, 10);
  const plazo_ro_dias = parseInt(document.getElementById('cfg_plazo_ro_dias').value, 10);

  if (!nombre) { showToast('El nombre del sistema es obligatorio', 'error'); return; }
  if (nombre.length > 100) { showToast('El nombre del sistema no puede superar los 100 caracteres', 'error'); return; }
  if (!subtitulo) { showToast('El subtítulo del proyecto es obligatorio', 'error'); return; }
  if (subtitulo.length > 180) { showToast('El subtítulo del proyecto no puede superar los 180 caracteres', 'error'); return; }

  for (const [label, val] of [
    ['Supervisión', plazo_sup_dias],
    ['Entidad', plazo_entidad_dias],
    ['Municipalidad', plazo_muni_dias],
    ['Junta Disputas', plazo_jrd_dias],
    ['Yo debo (RO)', plazo_ro_dias]
  ]) {
    if (isNaN(val) || val < 1 || val > 99999) {
      showToast(`Plazo ${label}: ingrese un entero entre 1 y 99.999`, 'error');
      return;
    }
  }

  const btn = document.getElementById('btnConfigSave');
  btn.disabled = true;
  btn.innerHTML = '<i class="ri-loader-4-line spin"></i> Guardando…';

  try {
    const payload = {
      nombre_sistema: nombre,
      subtitulo_proyecto: subtitulo,
      logo_url: pendingLogoBase64,
      favicon_url: pendingFaviconBase64,
      logo_membrete_word: pendingBannerWordBase64,
      dias_vencida,
      dias_por_vencer,
      dias_hilo,
      plazo_sup_dias,
      plazo_entidad_dias,
      plazo_muni_dias,
      plazo_jrd_dias,
      plazo_ro_dias,
      sync_semaforos: true
    };
    const r = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Error al guardar configuración');
    
    if (d.config) {
      applyConfig(d.config);
      initialConfigSnapshot = {
        nombre_sistema: (d.config.nombre_sistema || '').trim(),
        subtitulo_proyecto: (d.config.subtitulo_proyecto || '').trim(),
        logo_url: d.config.logo_url || null,
        favicon_url: d.config.favicon_url || null,
        logo_membrete_word: d.config.logo_membrete_word || null,
        plazo_sup_dias: parseInt(d.config.plazo_sup_dias ?? 5, 10),
        plazo_entidad_dias: parseInt(d.config.plazo_entidad_dias ?? 15, 10),
        plazo_muni_dias: parseInt(d.config.plazo_muni_dias ?? 15, 10),
        plazo_jrd_dias: parseInt(d.config.plazo_jrd_dias ?? 15, 10),
        plazo_ro_dias: parseInt(d.config.plazo_ro_dias ?? 5, 10)
      };
      syncUnifiedPlazoUI();
      checkConfigChanges();
      try { await loadData(); } catch(e) { console.warn('reload after config save', e); }
    }
    showToast('Configuración del sistema actualizada correctamente', 'success');
  } catch (ex) {
    showToast(ex.message, 'error');
  } finally {
    btn.innerHTML = '<i class="ri-save-line"></i> Guardar Cambios';
    checkConfigChanges();
  }
}

function handleConfigReset() {
  document.getElementById('cfg_nombre_sistema').value = 'SistemaGreace';
  document.getElementById('cfg_subtitulo_proyecto').value = 'Hospital Leoncio Prado (PRONIS/MINSA)';
  document.getElementById('cfg_plazo_sup_dias').value = 5;
  document.getElementById('cfg_plazo_entidad_dias').value = 15;
  document.getElementById('cfg_plazo_muni_dias').value = 15;
  document.getElementById('cfg_plazo_jrd_dias').value = 15;
  document.getElementById('cfg_plazo_ro_dias').value = 5;
  syncUnifiedPlazoUI();
  pendingLogoBase64 = null;
  pendingFaviconBase64 = null;
  pendingBannerWordBase64 = null;
  updateLogoPreviewUI(null);
  updateFaviconPreviewUI(null);
  updateBannerWordPreviewUI(null);
  updateTabPreviewUI();
  checkConfigChanges();
  showToast('Valores restablecidos a valores originales. Guarda los cambios para aplicar.', 'info');
}

document.getElementById('btnLogout').addEventListener('click',confirmLogout);
