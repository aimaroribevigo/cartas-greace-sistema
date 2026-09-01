function showViewLoading(show, title, sub){
  const overlay = document.getElementById('viewLoadingOverlay');
  if(!overlay) return;
  if(show){
    if(title) {
      const tEl = document.getElementById('viewLoadingTitle');
      if(tEl) tEl.textContent = title;
    }
    if(sub) {
      const sEl = document.getElementById('viewLoadingSub');
      if(sEl) sEl.textContent = sub;
    }
    overlay.classList.remove('hidden');
  } else {
    overlay.classList.add('hidden');
  }
}

function isPendContraparte(cl){
  return PEND_CONTRAPARTES.includes(cl&&cl.contraparte);
}
let PLAZO_RESPUESTA={
  supervisor:{dias:5,habiles:true,label:'5 días hábiles'},
  entidad:{dias:15,habiles:false,label:'15 días calendario'},
  municipalidad:{dias:15,habiles:false,label:'15 días calendario'},
  jrd:{dias:15,habiles:false,label:'15 días calendario'},
  otro:{dias:15,habiles:false,label:'15 días calendario'},
  rl:{dias:5,habiles:true,label:'5 días hábiles'},
  residente:{dias:5,habiles:true,label:'5 días hábiles'}
};
function plazoLabel(dias,habiles){
  return `${dias} días ${habiles?'hábiles':'calendario'}`;
}
function applyPlazoContractualConfig(cfg){
  if(!cfg)return;
  const ro=parseInt(cfg.plazo_ro_dias,10)||5;
  const sup=parseInt(cfg.plazo_sup_dias,10)||5;
  const ent=parseInt(cfg.plazo_entidad_dias,10)||15;
  const muni=parseInt(cfg.plazo_muni_dias,10)||15;
  const jrd=parseInt(cfg.plazo_jrd_dias,10)||15;
  PLAZO_RESPUESTA={
    supervisor:{dias:sup,habiles:true,label:plazoLabel(sup,true)},
    entidad:{dias:ent,habiles:false,label:plazoLabel(ent,false)},
    municipalidad:{dias:muni,habiles:false,label:plazoLabel(muni,false)},
    jrd:{dias:jrd,habiles:false,label:plazoLabel(jrd,false)},
    otro:{dias:ent,habiles:false,label:plazoLabel(ent,false)},
    rl:{dias:ro,habiles:true,label:plazoLabel(ro,true)},
    residente:{dias:ro,habiles:true,label:plazoLabel(ro,true)}
  };
  if(typeof HILO_PLAZO_DIAS!=='undefined')HILO_PLAZO_DIAS=ro;
  const hintDebo=document.querySelector('.pend-card.debo .hint');
  const hintMe=document.querySelector('.pend-card.me_deben .hint');
  if(hintDebo)hintDebo.textContent=`Recibidas abiertas de las 4 contrapartes. Plazo interno: ${ro} días hábiles. Cierre al responder.`;
  if(hintMe)hintMe.textContent=`Emitidas abiertas hacia las 4 contrapartes. Sup. ${sup} hábiles; Entidad ${ent} calendario tras traslado.`;
}
function computeDerivedPlazosFromContractual(){
  const ro=parseInt(document.getElementById('cfg_plazo_ro_dias')?.value,10)||5;
  const sup=parseInt(document.getElementById('cfg_plazo_sup_dias')?.value,10)||5;
  const ent=parseInt(document.getElementById('cfg_plazo_entidad_dias')?.value,10)||15;
  const muni=parseInt(document.getElementById('cfg_plazo_muni_dias')?.value,10)||15;
  const jrd=parseInt(document.getElementById('cfg_plazo_jrd_dias')?.value,10)||15;
  const maxCal=Math.max(ent,muni,jrd);
  const maxHab=Math.max(ro,sup);
  return{
    dias_hilo:ro,
    dias_vencida:Math.max(maxCal,maxHab),
    dias_por_vencer:Math.max(1,Math.min(ro,sup)-2)
  };
}
function syncUnifiedPlazoUI(){
  const derived=computeDerivedPlazosFromContractual();
  const hiloEl=document.getElementById('cfg_dias_hilo');
  if(hiloEl)hiloEl.value=derived.dias_hilo;
  const vencEl=document.getElementById('cfg_dias_vencida');
  if(vencEl)vencEl.value=derived.dias_vencida;
  const riesgoEl=document.getElementById('cfg_dias_por_vencer');
  if(riesgoEl)riesgoEl.value=derived.dias_por_vencer;

  const prevVenc=document.getElementById('cfg_preview_vencida');
  if(prevVenc)prevVenc.textContent=`≥ ${derived.dias_vencida} días`;
  const prevRiesgo=document.getElementById('cfg_preview_por_vencer');
  if(prevRiesgo)prevRiesgo.textContent=`≥ ${derived.dias_por_vencer} días`;
  const prevHilos=document.getElementById('cfg_preview_hilos');
  if(prevHilos)prevHilos.textContent=`${derived.dias_hilo} días hábiles`;

  applyPlazoContractualConfig({
    plazo_ro_dias:derived.dias_hilo,
    plazo_sup_dias:parseInt(document.getElementById('cfg_plazo_sup_dias')?.value,10)||5,
    plazo_entidad_dias:parseInt(document.getElementById('cfg_plazo_entidad_dias')?.value,10)||15,
    plazo_muni_dias:parseInt(document.getElementById('cfg_plazo_muni_dias')?.value,10)||15,
    plazo_jrd_dias:parseInt(document.getElementById('cfg_plazo_jrd_dias')?.value,10)||15
  });
  checkConfigChanges();
}
function inferContraparteHistorica(c){
  const ban=String(c.bandeja||'');
  if(ban==='recibida_sup')return'supervisor';
  if(ban==='recibida_pronis')return'entidad';
  if(ban==='recibida_mpsc')return'municipalidad';
  return classif(c).contraparte;
}
function cartaEraPendienteDebo(c){
  const ban=String(c.bandeja||'');
  if(!ban.startsWith('recibida'))return false;
  return isPendContraparte({contraparte:inferContraparteHistorica(c)});
}
function cartaEraPendienteMeDeben(c){
  const ban=String(c.bandeja||'');
  if(ban!=='residente'&&ban!=='rl')return false;
  return isPendContraparte(classif(c));
}
function addBusinessDays(start,n){
  const d=new Date(start.getTime());
  let added=0;
  while(added<n){
    d.setDate(d.getDate()+1);
    const wd=d.getDay();
    if(wd!==0&&wd!==6)added++;
  }
  return d;
}
function fechaLimiteRespuesta(fechaIso,contraparte){
  const base=parseDate(fechaIso);
  if(!base)return null;
  const cfg=PLAZO_RESPUESTA[contraparte]||PLAZO_RESPUESTA.otro;
  if(cfg.habiles)return addBusinessDays(base,cfg.dias);
  const d=new Date(base.getTime());
  d.setDate(d.getDate()+cfg.dias);
  return d;
}
function plazoRespuestaOperativo(c,modo){
  const cl=classif(c);
  const modoEff=modo||pendMode;
  let cp=cl.contraparte||'supervisor';
  let fecha=c.fecha;
  let notaTraslado='';
  const est=(cl.estado_norm||c.estado_norm||c.estado||'').toUpperCase();
  if(cl.deuda==='debo'||(modoEff==='debo'&&cl.sentido==='recibida')){
    cp='residente';
    notaTraslado='Plazo interno para responder';
  }else if(cl.sentido==='emitida'&&cl.deuda==='me_deben'&&est==='PENDIENTE ENTIDAD'){
    cp='entidad';
    if(c.fecha_respuesta){
      fecha=c.fecha_respuesta;
      notaTraslado='Traslado a entidad';
    }else{
      notaTraslado='Traslado (indique fecha traslado)';
    }
  }
  const cfg=PLAZO_RESPUESTA[cp]||PLAZO_RESPUESTA.otro;
  const limite=fechaLimiteRespuesta(fecha,cp);
  const reglaLabel=notaTraslado?`${cfg.label} · ${notaTraslado}`:cfg.label;
  if(!parseDate(fecha)){
    return{kind:'sin_fecha',label:'Sin fecha',fecha_limite:null,dias_atraso:null,dias_restantes:null,regla_label:reglaLabel};
  }
  if(!limite){
    return{kind:'sin_plazo',label:'Sin plazo',fecha_limite:null,dias_atraso:null,dias_restantes:null,regla_label:reglaLabel};
  }
  const hoy=today();
  const limDay=new Date(limite.getFullYear(),limite.getMonth(),limite.getDate(),12,0,0);
  const delta=Math.round((limDay-hoy)/86400000);
  if(delta<0){
    const atraso=-delta;
    return{kind:'vencida',label:`Vencida ${atraso}d`,fecha_limite:fmtDateIso(limDay),dias_atraso:atraso,dias_restantes:0,regla_label:reglaLabel};
  }
  if(delta===0){
    return{kind:'hoy',label:'Vence hoy',fecha_limite:fmtDateIso(limDay),dias_atraso:0,dias_restantes:0,regla_label:reglaLabel};
  }
  return{kind:'ok',label:`En plazo (${delta}d)`,fecha_limite:fmtDateIso(limDay),dias_atraso:0,dias_restantes:delta,regla_label:reglaLabel};
}
function emitidorCartaLabel(c){
  const cl=classif(c);
  const ban=String(c.bandeja||'');
  if(ban==='rl')return'Representante Legal (RL)';
  if(ban==='residente')return'Residente (RO)';
  return cl.actor_label||'—';
}
function pendPlazoBadgeHtml(plazo){
  const p=plazo||{};
  const cls=p.kind||'sin_fecha';
  let txt=p.label||'—';
  if(p.dias_atraso>0)txt=`+${p.dias_atraso}d atraso`;
  else if(p.dias_restantes>0&&cls==='ok')txt=`${p.dias_restantes}d restantes`;
  return `<span class="pend-plazo-badge ${cls}">${escapeHtml(txt)}</span>`;
}

const ABSOLUCION_RX = /\b(?:ABSUELV(?:EN|E|O|A)?|ABSUELT[OA]S?|ABSOLUCI[OÓ]N(?:\s+DE\s+CONSULTA|\s+A\s+LAS\s+OBSERVACIONES)?|ABSOLVER|ATENCI[OÓ]N\s+DE\s+CONSULTA|CONSULTA\s+ABSUELTA|PRONUNCIAMIENTO\s+A\s+LA\s+ABSOLUCION)\b/i;
const ENSAYOS_COMUNICACION_RX = /\b(?:PRESENTACI[OÓ]N\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|PRESENTAR\s+(?:LOS\s+)?ENSAYOS?|SOLICIT(?:A|UD|O)?\s+(?:SE\s+)?(?:DE\s+)?(?:LA\s+)?PRESENTACI[OÓ]N\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|REITERACI[OÓ]N(?:\s+CONSECUTIVA)?\s+(?:EN|DE)?\s+(?:LA\s+)?PRESENTACI[OÓ]N\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|SOLICIT(?:A|UD|O)?\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|ENTREGA\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|REMISI[OÓ]N\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|ENV[IÍ]O\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|RESULTADOS?\s+(?:DE\s+)?(?:LOS\s+)?ENSAYOS?|ENSAYOS?\s+DE\s+(?:CONTROL\s+DE\s+)?CALIDAD|ENSAYOS?\s+DE\s+(?:TUBER[IÍ]A|COBRE|CONCRETO|COMPRESI[OÓ]N|DENSIDAD|SUELOS?|ASFALTO|ACERO|PROBETAS?|MATERIAL(?:ES)?|LABORATORIO)|CERTIFICADOS?\s+DE\s+(?:CALIDAD|CALIBRACI[OÓ]N|RECALIBRACI[OÓ]N)|RECALIBRACI[OÓ]N(?:\s+DE\s+(?:LOS\s+)?EQUIPOS)?|PROTOCOLOS?\s+DE\s+(?:CALIDAD|LIBERACI[OÓ]N|PRUEBA)|DOSSIER\s+DE\s+CALIDAD|FICHAS?\s+T[EÉ]CNICA[SD]?|DISE[ÑN]O\s+DE\s+MEZCLAS?|ROTURAS?\s+A\s+COMPRESI[OÓ]N|ROTURA\s+DE\s+PROBETA|ENSAYOS?\s+DEL\s+LADRILLO|FORMATOS?\s+ATS|FORMATOS?\s+DE\s+SEGURIDAD|SEGURIDAD\s+Y\s+SALUD\s+EN\s+EL\s+TRABAJO|CHARLA\s+INFORMATIVA|INSTRUCTIVO\s+PARA\s+ATORTOLAR|DESENCOFRADO|PLAN\s+DE\s+CALIDAD\s+DEL\s+PROVEEDOR|MEZCLADORAS\s+DE\s+CONCRETO|PROGRAMA\s+DE\s+ENSAYOS|INSTRUCTIVOS?\s+DE\s+ENSAYOS|ANDAMIOS\s+CERTIFICADOS|CONSIDERACIONES\s+PARA\s+(?:EMPALME|LA\s+RECEPCI[OÓ]N))\b/i;
const COMUNICACION_GENERAL_RX = /\b(?:TRASLAD(?:O|AR|A|E)|REMIT(?:E|O)\s+COPIA|PARA\s+(?:FINES\s+DE\s+)?ARCHIVO|COMUNICADO|CARTA\s+CIRCULAR|PONE\s+EN\s+CONOCIMIENTO|PARA\s+(?:SU\s+)?CONOCIMIENTO|SOLO\s+INFORMATIVO|INFORMATIV[OA]|COMUNICA(?:MOS)?\s+(?:DESIGNACI[OÓ]N|INICIO|CONCLUSION|SUSPENSION|REINICIO|EVENTO|VISITA|FERIADO|DISPONIBILIDAD|ESTADO|AVANCE)|ALCANZA(?:R)?\s+CRONOGRAMA|REMIT(?:E|O)\s+(?:LOS\s+)?COMPROBANTES?|REMIT(?:E|O)\s+(?:LA\s+)?ACREDITACI[OÓ]N|REMIT(?:E|O|IR)\s+PLANO\s+GEORREFERENCIADO|ITINERARIO\s+DE\s+REUNI[OÓ]N|DECLARACI[OÓ]N\s+ANUAL|AMPLIACI[OÓ]N\s+DE\s+CORREOS?\s+ELECTR[OÓ]NICOS?|AMPLIACI[OÓ]N\s+DE\s+CORRESO|ALERTA\s+TEMPRANA|COMUNICACI[OÓ]N\s+DEL\s+MATERIAL|COMUNICACI[OÓ]N\s+DE\s+AFECTACIONES|NOTIFICACI[OÓ]N\s+DE\s+HITO|HITO\s+DE\s+CONTROL|ALCANZAR\s+ACTA|ACTA\s+DE\s+ACUERDOS|ACUERDOS\s+DEL\s+ACTA|DEVOLUCI[OÓ]N\s+DE\s+(?:03\s+)?ARCHIVADORES|DEVOLUCI[OÓ]N\s+DE\s+EXPEDIENTE|RESPUESTA\s+A\s+ALERTA|INVITACI[OÓ]N|CONVOCATORIA|DONACI[OÓ]N)\b/i;

function isOpen(est){
  const e=String(est||'').trim().toUpperCase();
  if(isClosedState(e)) return false;
  return OPEN_STATES.has(e);
}

function isClosedState(est){
  const e=String(est||'').trim().toUpperCase();
  if(CLOSED_PEND_STATES.has(e)) return true;
  if(e.includes('ABSUELT')||e.includes('ABSUELV')||e.includes('ABSOLUCI')||e.includes('CERRAD')||e.includes('ANULAD')||e.includes('SUBSANAD')||e==='PARA CONOCIMIENTO') return true;
  return false;
}

function isAbsolucionJs(c){
  if(!c) return false;
  const est=String(c.estado_norm||c.estado||'').toUpperCase();
  if(est.includes('ABSUELT')||est.includes('ABSUELV')||est.includes('ABSOLUCI')) return true;
  const blob=[c.asunto,c.n_documento,c.observacion,c.referencias].join(' ');
  return ABSOLUCION_RX.test(blob);
}

function isSoloComunicacionJs(c){
  if(!c) return false;
  const est=String(c.estado_norm||c.estado||'').toUpperCase();
  if(est==='PARA CONOCIMIENTO') return true;
  const blob=[c.asunto,c.n_documento,c.observacion,c.referencias].join(' ');
  return /TRASLAD/i.test(blob) || ENSAYOS_COMUNICACION_RX.test(blob) || COMUNICACION_GENERAL_RX.test(blob);
}

function analyzeSemanticIntent(c){
  if(!c) return { categoria: 'gestion_general', label: '📋 Gestión General', short_label: 'Gestión', exige_respuesta: true, action_hint: 'Trámite en gestión', keywords: [] };
  if(c.clasificacion && c.clasificacion.semantica){
    return c.clasificacion.semantica;
  }
  const asunto = String(c.asunto || '');
  const obs = String(c.observacion || '');
  const doc = String(c.n_documento || '');
  const refs = String(c.referencias || '');
  const blob = `${doc} ${asunto} ${obs} ${refs}`;

  const estado = String(c.estado_norm || c.estado || '').toUpperCase();
  if(estado === 'PARA CONOCIMIENTO' || isSoloComunicacionJs(c)){
    if(isAbsolucionJs(c)){
      return {
        categoria: 'absolucion',
        label: '✅ Absolución / Trámite Atendido',
        short_label: 'Absolución',
        exige_respuesta: false,
        action_hint: 'Consulta técnica o trámite resuelto y absuelto (cerrado sin deuda)',
        keywords: ['ABSUELTO']
      };
    }
    return {
      categoria: 'comunicacion',
      label: '📄 Solo Comunicación / Informativo',
      short_label: 'Solo Informativo',
      exige_respuesta: false,
      action_hint: 'Trámite registrado para conocimiento / comunicación informativa, sin deuda de respuesta',
      keywords: ['COMUNICACIÓN']
    };
  }

  const rules = [
    { cat: 'absolucion', label: '✅ Absolución / Trámite Atendido', short_label: 'Absolución', rx: ABSOLUCION_RX, hint: 'Consulta técnica o trámite resuelto y absuelto (cerrado sin deuda)', req: false },
    { cat: 'ensayo_calidad', label: '🧪 Control de Calidad / Ensayos', short_label: 'Ensayos / Calidad', rx: /\b(?:ENSAYOS?|DENSIDAD(?:ES)?|COMPRESI[OÓ]N|RESISTENCIA|PROCTOR|CALIDAD|DOSIFICACI[OÓ]N|DISE[ÑN]O\s+DE\s+MEZCLA|ROTURA\s+DE\s+PROBETA|SLUMP|ASENTAMIENTO|MTC|ESPECIFICACION(?:ES)?\s+T[EÉ]CNICA(?:S)?|CERTIFICADOS?\s+DE\s+CALIDAD|PROTOCOLOS?\s+DE\s+CALIDAD|DOSSIER\s+DE\s+CALIDAD)\b/i, hint: 'Presentación de ensayos o control de calidad (comunicado informativo)', req: false },
    { cat: 'reiterativo', label: '⚠️ Reiterativo / Urgente', short_label: 'Reiterativo', rx: /\b(?:REITERATIVO|REITERACI[OÓ]N|REITER(?:O|A)\s+(?:SOLICITUD|ATENCI[OÓ]N|PRONUNCIAMIENTO|RESPUESTA)|BAJO\s+APERCIBIMIENTO|URGENTE)\b/i, hint: 'Trámite con reiteración formal de atención urgente', req: true },
    { cat: 'consulta_rfi', label: '❓ Consulta Técnica / RFI', short_label: 'Consulta Técnica', rx: /\b(?:CONSULTA(?:\s*N[°º]?\s*\d+|\s+T[EÉ]CNICA|\s+DE\s+OBRA)?|INTERFERENCIA(?:S)?|INCOMPATIBILIDAD(?:ES)?|ACLARACI[OÓ]N\s+DE\s+PLANO(?:S)?|DUDAS?\s+T[EÉ]CNICA)\b/i, hint: 'Consulta técnica o incompatibilidad que exige absolución contractual', req: true },
    { cat: 'plazo_economico', label: '💰 Plazo / Económico', short_label: 'Plazo / Económico', rx: /\b(?:AMPLIACI[OÓ]N\s+DE\s+PLAZO|VALORIZACI[OÓ]N(?:\s*N[°º]?\s*\d+)?|ADICIONAL\s+DE\s+OBRA|MAYORES\s+METRADOS|DEDUCTIVO|LIQUIDACI[OÓ]N|PENALIDAD(?:ES)?|RECONOCIMIENTO\s+DE\s+GASTOS)\b/i, hint: 'Trámite contractual con plazos legales de Ley de Contrataciones', req: true },
    { cat: 'subsanacion', label: '🔧 Subsanación de Observaciones', short_label: 'Subsanación', rx: /\b(?:SUBSANACI[OÓ]N(?:\s+DE\s+OBSERVACI[OÓ]N(?:ES)?)?|LEVANTAMIENTO\s+DE\s+OBSERVACI[OÓ]N(?:ES)?|REINGRESO|ABSOLUCI[OÓ]N\s+DE\s+OBSERVACI[OÓ]N(?:ES)?|OBSERVACI[OÓ]N(?:ES)?\s+AL\s+INFORME)\b/i, hint: 'Subsanación o levantamiento de observaciones presentado para verificación', req: true },
    { cat: 'aprobacion', label: '📝 Solicitud de Aprobación', short_label: 'Solicitud Aprobación', rx: /\b(?:APROBACI[OÓ]N|SOLICIT(?:UD|O|A)\s+(?:DE\s+)?(?:APROBACI[OÓ]N|PRONUNCIAMIENTO|AUTORIZACI[OÓ]N|CONFORMIDAD|PERMISO|REVISI[OÓ]N)|SOLICIT(?:UD|O|A)\s+SE\s+(?:AUTORICE|APRUEBE|PRONUNCIE)|PRONUNCIAMIENTO|CONFORMIDAD)\b/i, hint: 'Solicitud formal que requiere pronunciamiento o autorización expresa', req: true },
    { cat: 'comunicacion', label: '📄 Solo Comunicación / Informativo', short_label: 'Solo Informativo', rx: COMUNICACION_GENERAL_RX, hint: 'Documento informativo o traslado sin requerimiento de respuesta', req: false },
  ];

  for(const r of rules){
    const matches = blob.match(r.rx);
    if(matches){
      const kw = Array.from(new Set(matches.map(m => m.trim().toUpperCase()))).slice(0, 4);
      return {
        categoria: r.cat,
        label: r.label,
        short_label: r.short_label,
        exige_respuesta: r.req,
        action_hint: r.hint,
        keywords: kw
      };
    }
  }

  return {
    categoria: 'gestion_general',
    label: '📋 Gestión General',
    short_label: 'Gestión General',
    exige_respuesta: isOpen(estado),
    action_hint: 'Trámite regular de obra en gestión',
    keywords: []
  };
}

function getCartaActionInfo(c){
  if(!c) return { canAction: false };
  const est = String(c.estado_norm || c.estado || '').trim().toUpperCase();
  const closed = isClosedState(est);
  const cl = (typeof classif === 'function') ? classif(c) : (c.clasificacion || {});
  const sem = analyzeSemanticIntent(c);
  
  if(closed || cl.solo_comunicacion || cl.naturaleza === 'comunicacion' || sem.categoria === 'comunicacion'){
    return {
      canAction: false,
      isClosed: true,
      reason: 'Trámite cerrado o solo informativo'
    };
  }

  const cDocNorm = typeof normalize_doc_key === 'function' ? normalize_doc_key(c.n_documento) : String(c.n_documento||'').trim().toUpperCase();
  const childCarta = (ALL_CARTAS||[]).find(other => {
    if(!other || other.id === c.id) return false;
    const oRef = typeof normalize_doc_key === 'function' ? normalize_doc_key(other.referencia) : String(other.referencia||'').trim().toUpperCase();
    return oRef && oRef === cDocNorm;
  });

  if(childCarta){
    return {
      canAction: true,
      mode: 'chain',
      icon: 'ri-git-branch-line',
      btnClass: 'btn-act-chain',
      title: `Trámite continuado en ${childCarta.n_documento}. Clic para emitir nueva carta en este hilo`,
      childDoc: childCarta.n_documento,
      targetId: c.id
    };
  }

  if(cl.deuda === 'debo'){
    return {
      canAction: true,
      mode: 'reply',
      icon: 'ri-reply-line',
      btnClass: 'btn-act-reply',
      title: `Responder a este trámite: Emitir respuesta oficial de obra`,
      targetId: c.id
    };
  }

  return {
    canAction: true,
    mode: 'follow',
    icon: 'ri-mail-send-line',
    btnClass: 'btn-act-follow',
    title: `Continuar trámite / Enviar reiterativo a ${quienRecibeLabel(c)} (Esperando respuesta)`,
    targetId: c.id
  };
}

function canRespondCarta(c){
  const act = getCartaActionInfo(c);
  return act.canAction;
}
function parseDate(v){if(!v)return null;const s=String(v).trim().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const d=new Date(s+'T12:00:00');return isNaN(d)?null:d;}
function today(){const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate(),12,0,0);}
function fmtDate(d){
  if(!d)return'';
  if(d instanceof Date){
    return isNaN(d.getTime())?'':d.toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'});
  }
  if(typeof d==='string'){
    const str=d.trim().split('T')[0];
    const parts=str.split('-');
    if(parts.length===3){
      const y=parseInt(parts[0],10),m=parseInt(parts[1],10)-1,day=parseInt(parts[2],10);
      const dt=new Date(y,m,day);
      if(!isNaN(dt.getTime()))return dt.toLocaleDateString('es-PE',{day:'2-digit',month:'short',year:'numeric'});
    }
    return str;
  }
  return String(d);
}
function getTodayIso(){
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fmtDateIso(d){
  if(!d) return '';
  if(d instanceof Date){
    if(isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d).trim().slice(0,10);
}
function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function bandejaLabel(id){return BANDEJAS_META[id]||id||'—';}
function monthLabel(m){if(!m)return'';const mo=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Set','Oct','Nov','Dic'];const[y,mn]=m.split('-');return mo[parseInt(mn,10)-1]+' '+y;}

function normalizeFlujoCode(raw){
  return String(raw||'').toUpperCase().replace(/[\u2794\u279C\u2192\u27A1➔➡→\s]/g,'').replace(/-/g,'');
}

function inferContraparteFromCarta(c){
  const ban=String(c.bandeja||'').trim();
  if(ban==='recibida_sup')return'supervisor';
  if(ban==='recibida_pronis')return'entidad';
  if(ban==='recibida_mpsc')return'municipalidad';
  if(ban.startsWith('recibida_'))return'otro';
  const cl=c.clasificacion||{};
  if(cl.contraparte)return cl.contraparte;
  const est=String(c.estado_norm||c.estado||'').toUpperCase();
  if(est.includes('MUNICIPALIDAD'))return'municipalidad';
  if(est.includes('ENTIDAD')||est.includes('PRONIS'))return'entidad';
  if(est.includes('SUPERVISION')||est.includes('SUPERVIS'))return'supervisor';
  const dir=[c.dirigido_a,c.receptor,c.cargo].join(' ').toUpperCase();
  if(/MPSC|MUNICIP|SANCHEZ CARRION/.test(dir))return'municipalidad';
  if(/PRONIS|MINSA|ENTIDAD|MESA DE PARTES/.test(dir))return'entidad';
  if(/JUNTA DE RESOLUCION|DISPUTAS|JRD/.test(dir))return'jrd';
  if(/CCC|SUPERV|CONSORCIO CONSULTOR/.test(dir))return'supervisor';
  if(ban==='rl')return'entidad';
  return'supervisor';
}

function cartaNaturaleza(cl){
  if(cl.naturaleza)return cl.naturaleza;
  if(cl.solo_comunicacion)return'comunicacion';
  if(cl.deuda==='debo'||cl.deuda==='me_deben')return'respuesta';
  return'respuesta';
}

function cartaMatchesContraparte(c,selected){
  if(!selected||selected==='all')return true;
  const cl=classif(c);
  if((cl.contraparte||'')===selected)return true;
  if(cl.deuda==='debo'){
    const banCp=contraparteFromBandeja(c);
    if(banCp&&banCp===selected)return true;
    const ban=String(c.bandeja||'');
    if(selected==='supervisor'&&ban==='recibida_sup')return true;
    if(selected==='entidad'&&ban==='recibida_pronis')return true;
    if(selected==='municipalidad'&&ban==='recibida_mpsc')return true;
  }
  return inferContraparteFromCarta(c)===selected;
}

function cartaMatchesPendiente(c,mode,actor,esp){
  const cl=classif(c);
  if(mode==='comunicacion')return cl.naturaleza==='comunicacion'||cl.solo_comunicacion;
  if(mode==='debo'){
    if(cl.deuda!=='debo')return false;
    if(!isPendContraparte(cl))return false;
  }else if(mode==='me_deben'){
    if(cl.deuda!=='me_deben')return false;
    if(!isPendContraparte(cl))return false;
  }else return false;
  if(actor&&actor!=='all'&&!cartaMatchesContraparte(c,actor))return false;
  if(esp&&esp!=='all'&&!cartaMatchesEsp(c,esp))return false;
  return true;
}

function inferClasificacion(c){
  const ban=String(c.bandeja||'');
  const sentido=c.sentido||(ban.startsWith('recibida')?'recibida':'emitida');
  const estado=(c.estado_norm||c.estado||'').toUpperCase();
  const esAbs=isAbsolucionJs(c);
  const abierta=!esAbs && isOpen(estado) && !isClosedState(estado);
  const esCom=isSoloComunicacionJs(c);
  let naturaleza='respuesta', deuda='ninguna';
  if(esAbs){
    naturaleza='respuesta'; deuda='ninguna';
  }else if(estado==='PARA CONOCIMIENTO'||esCom){
    naturaleza='comunicacion'; deuda='ninguna';
  }else if(!abierta){
    deuda='ninguna';
  }else if(sentido==='recibida'){
    deuda='debo';
  }else{
    deuda='me_deben';
  }
  const cp=inferContraparteFromCarta(c);
  const actorShort={supervisor:'SUP',entidad:'PRONIS',municipalidad:'MUNI',jrd:'JRD',otro:'OTRO',rl:'RL',residente:'RO'};
  const emisor=sentido==='recibida'?(actorShort[cp]||'SUP'):(ban==='rl'?'RL':'RO');
  const dest=sentido==='recibida'?'RO':(actorShort[cp]||'SUP');
  return{
    sentido,
    deuda,
    naturaleza,
    contraparte:cp,
    contraparte_label:ACTOR_LABELS[cp]||cp,
    emisor_code:emisor,
    dest_code:dest,
    flujo_code:`${emisor}\u2794${dest}`,
    flujo_label:`${emisor} \u2794 ${dest}`,
    abierta,
    solo_comunicacion:naturaleza==='comunicacion'
  };
}

function contraparteFromBandeja(c){
  const ban=String(c.bandeja||'').trim();
  if(ban==='recibida_sup')return'supervisor';
  if(ban==='recibida_pronis')return'entidad';
  if(ban==='recibida_mpsc')return'municipalidad';
  return null;
}

function classif(c){
  const cl=c.clasificacion;
  const bandejaCp=contraparteFromBandeja(c);
  if(cl&&cl.deuda!=null&&cl.flujo_code){
    const cp=bandejaCp||cl.contraparte||inferContraparteFromCarta(c);
    return{
      ...cl,
      contraparte:cp,
      contraparte_label:cl.contraparte_label||ACTOR_LABELS[cp]||cp,
      naturaleza:cl.naturaleza||cartaNaturaleza(cl)
    };
  }
  return inferClasificacion(c);
}

function cartaMatchesFlujo(c,selected){
  if(!selected||selected==='all')return true;
  const cl=classif(c);
  if(normalizeFlujoCode(cl.flujo_code)===normalizeFlujoCode(selected))return true;
  const ban=String(c.bandeja||'');
  const sel=normalizeFlujoCode(selected);
  if(sel==='SUPRO'&&(ban==='recibida_sup'||ban.startsWith('recibida_otros')))return true;
  if(sel==='ROSUP'&&(ban==='residente'||ban==='rl'))return true;
  if(sel==='PRONISRO'&&ban.startsWith('recibida_pronis'))return true;
  return false;
}
function debtBadge(c){
  const cl=classif(c);
  if(cl.solo_comunicacion||cl.naturaleza==='comunicacion')return{cls:'comunicacion',label:'Traslado / comunicación'};
  if(cl.deuda==='debo')return{cls:'debo',label:'Yo debo → '+(cl.contraparte_label||cl.contraparte||'')};
  if(cl.deuda==='me_deben')return{cls:'me_deben',label:'Me debe '+(cl.contraparte_label||cl.contraparte||'')};
  return{cls:'ninguna',label:'Sin deuda'};
}

function deadlineStatus(c){
  const cl=classif(c);
  if(cl.solo_comunicacion||cl.naturaleza==='comunicacion'){
    const fecha=parseDate(c.fecha);
    return{kind:'comunicacion',days:null,label:'Solo comunicación',date:fecha,open:false};
  }
  const estado=(c.estado_norm||c.estado||'').toUpperCase();
  const open=isOpen(estado);
  const fecha=parseDate(c.fecha);
  if(!open)return{kind:'cerrada',days:null,label:estado||'Cerrada',date:fecha,open:false};
  if(!fecha)return{kind:'sin_plazo',days:null,label:'Abierta sin fecha',date:null,open:true};
  const daysOpen=Math.round((today()-fecha)/86400000);
  if(daysOpen>=VENCIDA_DIAS)return{kind:'vencida',days:-daysOpen,label:`Abierta hace ${daysOpen} días`,date:fecha,open:true};
  if(daysOpen>=POR_VENCER_DIAS){const rest=VENCIDA_DIAS-daysOpen;return{kind:'por_vencer',days:rest,label:`En riesgo (${daysOpen}d abierta)`,date:fecha,open:true};}
  return{kind:'ok',days:VENCIDA_DIAS-daysOpen,label:`En gestión (${daysOpen}d)`,date:fecha,open:true};
}

function matchesPlazo(c,f){
  if(f==='all')return true;
  const st=deadlineStatus(c);
  if(f==='abiertas')return st.open;
  if(f==='hoy-or-por_vencer')return st.kind==='por_vencer';
  return st.kind===f;
}

function plazoRank(kind){return({vencida:0,por_vencer:1,ok:2,sin_plazo:3,comunicacion:4,cerrada:5}[kind]??9);}

function estadoBadgeClass(est){
  const e=(est||'').toUpperCase();
  if(e.includes('CERR')||e.includes('ABSUELT')||e.includes('ABSUELV')||e.includes('ABSOLUCI')||e.includes('SUBSANAD'))return'cerrado';
  if(e==='PARA CONOCIMIENTO'||e.includes('INFORMATIV')||e.includes('COMUNIC'))return'comunicacion';
  if(isClosedState(e))return'cerrado';
  if(OPEN_STATES.has(e))return'abierto';
  if(e.includes('OBSERV'))return'observado';
  return'otro';
}

function totalPages(){return Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)||1);}

function showToast(msg,type='info'){
  const c=document.getElementById('toastContainer');
  const t=document.createElement('div');
  t.className='toast '+type;
  const ic={success:'ri-check-line',error:'ri-error-warning-line',info:'ri-information-line'};
  t.innerHTML=`<i class="${ic[type]||ic.info}"></i> ${escapeHtml(msg)}`;
  c.appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transform='translateY(10px)';t.style.transition='all .3s';setTimeout(()=>t.remove(),300);},3500);
}
