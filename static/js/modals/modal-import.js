let selectedExcelFile = null;
function confirmReimport(){
  const fileInput = document.getElementById('excelFileInput');
  if(fileInput){
    fileInput.value = '';
    fileInput.click();
  }
}

async function executeReimportFile(){
  if(!selectedExcelFile) return;
  const file = selectedExcelFile;
  closeConfirm();

  const loadingOverlay = document.getElementById('importLoadingOverlay');
  const loadingMsg = document.getElementById('importLoadingMsg');
  if(loadingMsg) loadingMsg.textContent = `Subiendo ${file.name}... Por favor espera…`;
  if(loadingOverlay) loadingOverlay.classList.add('active');

  const formData = new FormData();
  formData.append('file', file);
  formData.append('force', 'true');

  try {
    const res = await apiFetch('/api/import/excel?async=1', {
      method: 'POST',
      body: formData
    });
    let data = await res.json().catch(() => ({}));
    if(!res.ok || (!data.ok && !data.async)){
      throw new Error(data.error || `Error del servidor (${res.status}) al subir el archivo.`);
    }

    // Polling en tiempo real si se procesa en segundo plano
    if(data.async){
      let pollCount = 0;
      const maxPolls = 180; // hasta 3 minutos
      while(pollCount < maxPolls){
        await new Promise(r => setTimeout(r, 1000));
        pollCount++;
        const sRes = await apiFetch('/api/import/status');
        const sData = await sRes.json().catch(() => ({}));
        if(sData.step && loadingMsg){
          loadingMsg.textContent = `${sData.step} (${sData.progress || 0}%)`;
        }
        if(!sData.running){
          if(sData.error){
            throw new Error(sData.error);
          }
          data = sData.result || {};
          break;
        }
      }
    }

    if(!data.ok || !data.inserted || data.inserted === 0){
      let errDetail = data.error;
      if (!errDetail) {
        if (data.sheets) {
          errDetail = `No se encontraron registros de cartas en las hojas [${data.sheets.join(', ')}].`;
        } else {
          errDetail = 'No se encontraron registros de cartas válidos en el archivo Excel.';
        }
      }
      throw new Error(errDetail);
    }

    if(loadingOverlay) loadingOverlay.classList.remove('active');

    const successOverlay = document.getElementById('importSuccessOverlay');
    const successMsg = document.getElementById('importSuccessMsg');
    if(successMsg){
      const count = data.inserted || 0;
      const sheetsList = data.sheets_processed ? `<br><small style="color:var(--text-muted)">Hojas procesadas: ${data.sheets_processed.join(' · ')}</small><br>` : '';
      successMsg.innerHTML = `
        Se han importado exitosamente <strong>${count.toLocaleString()} cartas</strong> desde el archivo <strong>${escapeHtml(file.name)}</strong>.${sheetsList}<br>
        Toda la información anterior ha sido reemplazada. Haz clic en el botón a continuación para <strong>refrescar la página</strong> y visualizar los nuevos datos.`;
    }
    if(successOverlay) successOverlay.classList.add('active');
  } catch(err){
    if(loadingOverlay) loadingOverlay.classList.remove('active');
    console.error('Error reimportando archivo:', err);
    showToast(err.message || 'Error al reimportar el archivo Excel', 'error');
    alert(err.message || 'Error al procesar el archivo Excel. Asegúrate de seleccionar el archivo Control de Cartas correcto.');
  } finally {
    selectedExcelFile = null;
  }
}

function formatBackfillSummary(d){
  const parts=[];
  if(d.fill){
    if(d.fill.referencia_updated)parts.push(`${d.fill.referencia_updated} referencias`);
    if(d.fill.area_updated)parts.push(`${d.fill.area_updated} áreas nuevas`);
  }
  if(d.areas){
    if(d.areas.areas_fixed)parts.push(`${d.areas.areas_fixed} responsables corregidos`);
    if(d.areas.oficina_tecnica_remaining!=null)parts.push(`OT restante: ${d.areas.oficina_tecnica_remaining}`);
  }
  return parts.length?parts.join(' · '):'Sin cambios pendientes';
}

async function runBackfillHistorico(dryRun=false){
  const btns=[document.getElementById('btnBackfillHistorico'),document.getElementById('btnBackfillPreview')].filter(Boolean);
  const status=document.getElementById('cfg_backfill_status');
  btns.forEach(b=>{b.disabled=true;});
  if(status)status.textContent=dryRun?'Analizando…':'Ejecutando backfill…';
  showToast(dryRun?'Analizando backfill (vista previa)…':'Backfill histórico en curso…','info');
  try{
    const r=await apiFetch('/api/backfill/cartas',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({dry_run:!!dryRun,fill_missing:true,fix_areas:true})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok||!d.ok)throw new Error(d.error||'Fallo en backfill');
    const summary=formatBackfillSummary(d);
    if(status)status.textContent=summary;
    if(dryRun){
      showToast(`Vista previa: ${summary}`,'info');
      if(d.areas?.samples?.length){
        console.info('Backfill preview samples',d.areas.samples);
      }
    }else{
      showToast(`Backfill aplicado: ${summary}`,'success');
      await refreshData();
    }
  }catch(e){
    if(status)status.textContent='';
    showToast('Error backfill: '+e.message,'error');
  }finally{
    btns.forEach(b=>{b.disabled=false;});
  }
}

