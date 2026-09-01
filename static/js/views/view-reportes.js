function renderReportesSkeleton(){
  ['kpiTotal','kpiCerradas','kpiAbiertas','kpiAlertas'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.innerHTML='<div class="skeleton" style="width:55px;height:30px"></div>';
  });
  const dlStats=document.getElementById('deadlineStatsReportes');
  if(dlStats){
    dlStats.innerHTML=`
      <div class="deadline-stat" style="border:none;background:#EDEAE3"><div class="skeleton" style="width:28px;height:24px;margin-bottom:2px"></div><div class="skeleton" style="width:55px;height:10px"></div></div>
      <div class="deadline-stat" style="border:none;background:#EDEAE3"><div class="skeleton" style="width:28px;height:24px;margin-bottom:2px"></div><div class="skeleton" style="width:55px;height:10px"></div></div>
      <div class="deadline-stat" style="border:none;background:#EDEAE3"><div class="skeleton" style="width:28px;height:24px;margin-bottom:2px"></div><div class="skeleton" style="width:55px;height:10px"></div></div>`;
  }
  const chartMap={bandeja:'chartBandeja',estado:'chartEstado',esp:'chartEsp',month:'chartMonth'};
  Object.entries(chartMap).forEach(([k,elemId])=>{
    const el=document.getElementById(elemId);
    if(el&&!charts[k])charts[k]=echarts.init(el);
    if(charts[k]){
      charts[k].showLoading({text:'Cargando…',color:'#C45B3E',textColor:'#777',maskColor:'rgba(250,249,246,0.85)',zlevel:2});
    }
  });
}

function updateKPIs(){
  const total=filtered.length;
  const counts=countPlazos(filtered);
  const abiertas=counts.abiertas;
  const cerradas=total-abiertas;
  const alertas=counts.vencida+counts.por_vencer;
  const elTotal = document.getElementById('kpiTotal');
  if(elTotal) elTotal.textContent=total;
  const elTotalSub = document.getElementById('kpiTotalSub');
  if(elTotalSub) elTotalSub.innerHTML=`<i class="ri-arrow-right-s-line"></i>${activeBandeja==='all'?'Todas las bandejas':bandejaLabel(activeBandeja)}`;
  const elCerradas = document.getElementById('kpiCerradas');
  if(elCerradas) elCerradas.textContent=cerradas;
  const elCerradasSub = document.getElementById('kpiCerradasSub');
  if(elCerradasSub) elCerradasSub.textContent=total?Math.round(cerradas/total*100)+'% del filtro':'0%';
  const elAbiertas = document.getElementById('kpiAbiertas');
  if(elAbiertas) elAbiertas.textContent=abiertas;
  const elAbiertasSub = document.getElementById('kpiAbiertasSub');
  if(elAbiertasSub) elAbiertasSub.textContent=total?Math.round(abiertas/total*100)+'% del filtro':'0%';
  const elAlertas = document.getElementById('kpiAlertas');
  if(elAlertas) elAlertas.textContent=alertas;
  const elAlertasSub = document.getElementById('kpiAlertasSub');
  if(elAlertasSub) elAlertasSub.textContent=alertas?`${counts.vencida} venc. · ${counts.por_vencer} en riesgo`:'Sin alertas en el filtro';
  const elJump = document.getElementById('jumpCount');
  if(elJump) elJump.textContent=total;
  const elInline = document.getElementById('tableCountInline');
  if(elInline) elInline.textContent=total;
  if(typeof updateTodayTasksCounts === 'function') updateTodayTasksCounts();
}

function chartOptBase(){return{tooltip:{backgroundColor:'#fff',borderColor:'transparent',shadowBlur:8,textStyle:{color:'#1A1A1A',fontSize:12,fontFamily:'DM Sans'}},animationDuration:600};}

function updateCharts(){
  if(typeof echarts === 'undefined') return;
  updateBandejaChart();updateEstadoChart();updateEspChart();updateMonthChart();
  setupChartClickHandlers();
}

function setupChartClickHandlers(){
  if(charts.bandeja&&!charts.bandeja._clickBound){
    charts.bandeja._clickBound=true;
    charts.bandeja.on('click',e=>{
      const key=Object.keys(BANDEJAS_META).find(k=>BANDEJAS_META[k]===e.name)||e.name;
      if(key){
        document.getElementById('filterBandeja').value=key;
        activeBandeja=key;
        applyFilters();
        showToast('Filtro por bandeja: '+e.name,'info');
      }
    });
  }
  if(charts.estado&&!charts.estado._clickBound){
    charts.estado._clickBound=true;
    charts.estado.on('click',e=>{
      if(e.name){
        document.getElementById('filterEstado').value=e.name;
        applyFilters();
        showToast('Filtro por estado: '+e.name,'info');
      }
    });
  }
  if(charts.esp&&!charts.esp._clickBound){
    charts.esp._clickBound=true;
    charts.esp.on('click',e=>{
      if(e.name){
        document.getElementById('filterEsp').value=e.name;
        applyFilters();
        showToast('Filtro por especialidad: '+e.name,'info');
      }
    });
  }
}

function agg(field){
  const m={};
  filtered.forEach(c=>{
    if(field==='especialidad_norm'||field==='especialidad'){
      const esps=getCartaEspecialidades(c);
      esps.forEach(e=>{m[e]=(m[e]||0)+1;});
    }else{
      const k=c[field]||'—';
      m[k]=(m[k]||0)+1;
    }
  });
  return Object.entries(m).sort((a,b)=>b[1]-a[1]);
}

function updateBandejaChart(){
  const entries=agg('bandeja').map(([k,v])=>[bandejaLabel(k),v]);
  if(!charts.bandeja)charts.bandeja=echarts.init(document.getElementById('chartBandeja'));
  charts.bandeja.hideLoading();
  if(!entries.length){
    charts.bandeja.setOption({...chartOptBase(),title:{text:'Sin datos con los filtros actuales',left:'center',top:'center',textStyle:{color:'#999',fontSize:13}},series:[]});
    document.querySelector('#insightBandeja span').textContent='Sin datos en el filtro actual.';
    return;
  }
  charts.bandeja.setOption({...chartOptBase(),title:{show:false},tooltip:{trigger:'item',formatter:p=>`<b>${p.name}</b><br/>${p.value} cartas (${p.percent}%)`},
    series:[{type:'pie',radius:['42%','72%'],data:entries.map(([n,v],i)=>({name:n,value:v,itemStyle:{color:PALETTE[i%PALETTE.length]}})),label:{fontSize:11}}]});
  const pct=filtered.length?Math.round(entries[0][1]/filtered.length*100):0;
  document.querySelector('#insightBandeja span').textContent=`${entries[0][0]} concentra ${entries[0][1]} cartas (${pct}%).`;
}

function updateEstadoChart(){
  const entries=agg('estado_norm');
  if(!charts.estado)charts.estado=echarts.init(document.getElementById('chartEstado'));
  charts.estado.hideLoading();
  if(!entries.length){
    charts.estado.setOption({...chartOptBase(),title:{text:'Sin datos con los filtros actuales',left:'center',top:'center',textStyle:{color:'#999',fontSize:13}},series:[]});
    document.querySelector('#insightEstado span').textContent='Sin estados en el filtro.';
    return;
  }
  charts.estado.setOption({...chartOptBase(),title:{show:false},tooltip:{trigger:'item',formatter:p=>`<b>${p.name}</b><br/>${p.value} cartas (${p.percent}%)`},
    series:[{type:'pie',radius:['42%','72%'],data:entries.map(([n,v],i)=>({name:n,value:v,itemStyle:{color:PALETTE[i%PALETTE.length]}})),label:{fontSize:10}}]});
  document.querySelector('#insightEstado span').textContent=`Estado más frecuente: ${entries[0][0]} (${entries[0][1]} cartas).`;
}

function updateEspChart(){
  const entries=agg('especialidad_norm');
  if(!charts.esp)charts.esp=echarts.init(document.getElementById('chartEsp'));
  charts.esp.hideLoading();
  if(!entries.length){
    charts.esp.setOption({...chartOptBase(),title:{text:'Sin datos con los filtros actuales',left:'center',top:'center',textStyle:{color:'#999',fontSize:13}},series:[]});
    document.querySelector('#insightEsp span').textContent='Sin especialidades en el filtro.';
    return;
  }
  const topEntries=entries.slice(0,15);
  const names=topEntries.map(e=>e[0]).reverse(),vals=topEntries.map(e=>e[1]).reverse();
  charts.esp.setOption({...chartOptBase(),title:{show:false},tooltip:{trigger:'axis'},grid:{left:10,right:35,top:10,bottom:20,containLabel:true},
    xAxis:{type:'value',splitLine:{lineStyle:{color:'#E0DCD6'}}},yAxis:{type:'category',data:names,axisLabel:{fontSize:11}},
    series:[{type:'bar',data:vals,itemStyle:{color:p=>PALETTE[p.dataIndex%PALETTE.length],borderRadius:[0,4,4,0]},barWidth:16,label:{show:true,position:'right',fontSize:11}}]});
  document.querySelector('#insightEsp span').textContent=`${entries[0][0]} lidera con ${entries[0][1]} cartas.`;
}

function updateMonthChart(){
  const m={};filtered.forEach(c=>{if(c.fecha){const k=c.fecha.slice(0,7);m[k]=(m[k]||0)+1;}});
  const keys=Object.keys(m).sort(),vals=keys.map(k=>m[k]);
  if(!charts.month)charts.month=echarts.init(document.getElementById('chartMonth'));
  charts.month.hideLoading();
  if(!keys.length){
    charts.month.setOption({...chartOptBase(),title:{text:'Sin fechas con los filtros actuales',left:'center',top:'center',textStyle:{color:'#999',fontSize:13}},series:[]});
    document.querySelector('#insightMonth span').textContent='Sin fechas en el filtro.';
    return;
  }
  const maxVal=Math.max(...vals);
  const peak=keys[vals.indexOf(maxVal)];
  charts.month.setOption({...chartOptBase(),title:{show:false},tooltip:{trigger:'axis'},grid:{left:10,right:25,top:20,bottom:30,containLabel:true},
    xAxis:{type:'category',data:keys.map(monthLabel),axisLabel:{rotate:30,fontSize:11}},yAxis:{type:'value',splitLine:{lineStyle:{color:'#E0DCD6'}}},
    series:[{type:'line',data:vals,smooth:true,symbolSize:8,lineStyle:{width:3,color:'#C45B3E'},itemStyle:{color:'#C45B3E'},areaStyle:{color:'rgba(196,91,62,.08)'}}]});
  document.querySelector('#insightMonth span').textContent=peak?`Pico en ${monthLabel(peak)} con ${maxVal} cartas registradas.`:'Sin fechas en el filtro.';
}

function showCartasLoading(show=true){
  const bar=document.getElementById('cartasProgressBar');
  if(bar)bar.classList.toggle('active',show);
}

function renderTableSkeleton(count=8){
  showCartasLoading(true);
  const tbody=document.getElementById('tableBody');
  if(!tbody)return;
  let html='';
  for(let i=0;i<count;i++){
    const wDoc=90+(i%4)*15;
    const wAsunto=140+(i%3)*35;
    const wDir=95+(i%2)*25;
    html+=`
      <tr class="skeleton-row">
        <td><div class="skeleton skeleton-text" style="width:20px"></div></td>
        <td><div class="skeleton skeleton-text" style="width:${wDoc}px"></div></td>
        <td><div class="skeleton skeleton-text" style="width:75px"></div></td>
        <td><div class="skeleton skeleton-pill" style="width:80px"></div></td>
        <td><div class="skeleton skeleton-pill" style="width:80px"></div></td>
        <td><div class="skeleton skeleton-text" style="width:85px"></div></td>
        <td><div class="skeleton skeleton-text" style="width:85px"></div></td>
        <td><div class="skeleton skeleton-text" style="width:${wAsunto}px"></div></td>
        <td><div class="skeleton skeleton-text" style="width:90px"></div></td>
        <td><div class="skeleton skeleton-badge" style="width:80px"></div></td>
        <td><div class="skeleton skeleton-badge" style="width:85px"></div></td>
        <td><div class="skeleton skeleton-badge" style="width:80px"></div></td>
        <td><div class="skeleton skeleton-text" style="width:110px"></div></td>
        <td class="col-acc"><div class="skeleton skeleton-icon"></div></td>
      </tr>`;
  }
  tbody.innerHTML=html;
}

function updateTable(){
  showCartasLoading(false);
  const countEl=document.getElementById('tableCountInline');
  if(countEl)countEl.textContent=filtered.length;
  const tbody=document.getElementById('tableBody');
  if(!tbody)return;
  const start=(currentPage-1)*PAGE_SIZE;
  const rows=filtered.slice(start,start+PAGE_SIZE);
  if(!rows.length){
    tbody.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--text-muted);padding:28px">Sin cartas con los filtros actuales</td></tr>';
    updatePagination(start,0);
    return;
  }
  const canCreate = !!(CURRENT_USER && CURRENT_USER.can_create_cartas);
  const canEdit = !!(CURRENT_USER && CURRENT_USER.can_edit_cartas);
  const canDelete = !!(CURRENT_USER && CURRENT_USER.can_delete_cartas);

  const htmlBuffer = rows.map((c,idx)=>{
    const st=deadlineStatus(c);
    const sem=analyzeSemanticIntent(c);
    const act=getCartaActionInfo(c);
    const pb=st.kind==='por_vencer'?'por-vencer':st.kind.replace('_','-');
    const rowClass = 'row-rendered' + (st.kind==='vencida' ? ' row-vencida' : '') + (st.kind==='por_vencer' ? ' row-por-vencer' : '');
    const itemNumber=start+idx+1;

    const dotHtml = st.kind==='vencida' ? '<span class="row-dot vencida" title="Vencida"></span>' : (st.kind==='por_vencer' ? '<span class="row-dot por-vencer" title="Por vencer"></span>' : '');
    const docNum = escapeHtml(cleanSpaces(c.n_documento || '—'));
    const copyBtn = c.n_documento ? `<button type="button" class="btn-copy-doc" title="Copiar N° de documento" onclick="copyDocToClipboard('${escapeHtml(c.n_documento)}', this, event)"><i class="ri-file-copy-line"></i></button>` : '';

    const semBadge=(sem&&sem.categoria!=='gestion_general')
      ?`<div class="intent-badge ${sem.categoria}" title="${escapeHtml(sem.action_hint)}">${escapeHtml(sem.short_label)}</div>`
      :'';

    const refHtml = formatCartaReferenciaTableHtml(c);

    let actionBtnHtml='';
    if(canCreate && act.canAction){
      actionBtnHtml=`<button type="button" class="btn-act ${act.btnClass}" title="${escapeHtml(act.title)}" onclick="openResponderModal(${c.id})"><i class="${act.icon}"></i></button>`;
    }

    return `
      <tr class="${rowClass}" style="animation-delay:${Math.min(idx*10,120)}ms">
        <td><div class="row-num-cell">${itemNumber}${dotHtml}</div></td>
        <td class="cell-wrap"><div class="doc-num-wrap"><span class="doc-num-text">${docNum}</span>${copyBtn}</div></td>
        <td style="white-space:nowrap;font-weight:500;color:var(--text-secondary)">${escapeHtml(fmtDate(c.fecha)||'—')}</td>
        <td class="cell-wrap" style="font-weight:600;color:var(--text-secondary)">${escapeHtml(cleanSpaces(getTipoDocumentoDisplay(c)))}</td>
        <td class="cell-wrap">${formatEspecialidadBadge(c)}</td>
        <td class="cell-wrap">${humanFlujoBadge(c)}</td>
        <td class="cell-wrap" style="line-height:1.4">${escapeHtml(cleanSpaces(c.asunto||'—'))}${semBadge}</td>
        <td class="cell-wrap">${refHtml}</td>
        <td class="cell-wrap">${getRespRespuestaLabel(c)}</td>
        <td><span class="plazo-badge ${pb}"><span><i class="ri-time-line"></i> ${escapeHtml(st.label)}</span>${st.date?`<span class="plazo-date">${fmtDate(st.date)}</span>`:''}</span></td>
        <td><span class="status-badge ${estadoBadgeClass(c.estado_norm)}">${escapeHtml(cleanSpaces(c.estado_norm||c.estado||'—'))}</span></td>
        <td class="cell-wrap" style="font-size:11.5px;color:var(--text-secondary);max-width:200px" title="${escapeHtml(cleanSpaces(c.observacion||''))}">${escapeHtml(cleanSpaces(c.observacion||'—'))}</td>
        <td class="col-acc">
          <div class="actions-group">
            ${actionBtnHtml}
            <button type="button" class="btn-act btn-act-edit" title="${canEdit?'Editar carta':'Ver carta (solo lectura)'}" onclick="openEditModal(${c.id})"><i class="${canEdit?'ri-edit-line':'ri-eye-line'}"></i></button>
            ${canDelete?`<button type="button" class="btn-act btn-act-del" title="Eliminar carta" onclick="confirmDelete(${c.id})"><i class="ri-delete-bin-line"></i></button>`:''}
          </div>
        </td>
      </tr>`;
  }).join('');

  tbody.innerHTML = htmlBuffer;
  updatePagination(start,rows.length);
}

