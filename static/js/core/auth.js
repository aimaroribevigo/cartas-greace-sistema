
async function apiFetch(url, opts={}){
  const o={credentials:'same-origin',...opts};
  const isFormData = o.body instanceof FormData;
  if(o.body && !isFormData){
    if(!o.headers)o.headers={'Content-Type':'application/json'};
    else if(!o.headers['Content-Type'])o.headers={...o.headers,'Content-Type':'application/json'};
  }
  const r=await fetch(url,o);
  if(r.status===401){
    const e=await r.json().catch(()=>({}));
    if(e.code==='auth_required'||AUTH_REQUIRED){
      showLoginGate('Sesión requerida');
      throw new Error('No autenticado');
    }
  }
  if(r.status===403){
    const e=await r.json().catch(()=>({}));
    if(e.code==='password_change_required'){
      showPwdGate();
      throw new Error('Debes cambiar tu contraseña');
    }
  }
  return r;
}

function hideSplash(){
  const s=document.getElementById('appSplash');
  if(s)s.classList.add('hidden');
}

function showLoginGate(msg){
  hideSplash();
  document.body.classList.add('app-locked');
  document.getElementById('loginGate').classList.remove('hidden');
  document.getElementById('pwdGate').classList.add('hidden');
  if(msg)document.getElementById('loginError').textContent=msg;
}

function hideLoginGate(){
  hideSplash();
  document.body.classList.remove('app-locked');
  document.getElementById('loginGate').classList.add('hidden');
  document.getElementById('loginError').textContent='';
}

function showPwdGate(isVoluntary=false){
  hideSplash();
  const gate=document.getElementById('pwdGate');
  gate.classList.remove('hidden');
  document.getElementById('loginGate').classList.add('hidden');
  const isMandatory=(CURRENT_USER&&CURRENT_USER.must_change_password)&&!isVoluntary;
  if(isMandatory){
    document.body.classList.add('app-locked');
    document.getElementById('pwdModalTitle').textContent='Cambia tu contraseña';
    document.getElementById('pwdModalSub').textContent='Por seguridad debes dejar de usar la clave por defecto antes de continuar.';
    const cancelBtn=document.getElementById('btnPwdCancel');
    if(cancelBtn)cancelBtn.style.display='none';
  }else{
    document.body.classList.remove('app-locked');
    document.getElementById('pwdModalTitle').textContent='Cambiar contraseña';
    document.getElementById('pwdModalSub').textContent='Ingresa tu contraseña actual y define tu nueva clave de acceso.';
    const cancelBtn=document.getElementById('btnPwdCancel');
    if(cancelBtn)cancelBtn.style.display='inline-flex';
  }
  document.getElementById('pwdError').textContent='';
}

function hidePwdGate(){
  document.getElementById('pwdGate').classList.add('hidden');
  document.body.classList.remove('app-locked');
  document.getElementById('pwdCurrent').value='';
  document.getElementById('pwdNew').value='';
  document.getElementById('pwdNew2').value='';
  document.getElementById('pwdError').textContent='';
}

function userPerm(user,key){
  if(!user)return false;
  if(user[key]!=null)return!!user[key];
  const rol=String(user.rol||'').toLowerCase();
    const byRol={
    can_create_cartas:rol==='admin',
    can_delete_cartas:rol==='admin',
    can_edit_formal:rol==='admin',
    can_edit_cartas:rol==='admin',
    can_import:rol==='admin'||rol==='residente',
    can_notify:rol==='admin'||rol==='residente',
    can_manage_users:rol==='admin',
    can_see_all:rol==='admin'||rol==='residente',
    vista_parcial:rol==='ingeniero',
    solo_lectura_cartas:rol==='ingeniero'||rol==='residente'
  };
  return byRol[key]??false;
}

function applyUserChrome(user){
  CURRENT_USER=user?{...user,
    can_create_cartas:userPerm(user,'can_create_cartas'),
    can_delete_cartas:userPerm(user,'can_delete_cartas'),
    can_edit_formal:userPerm(user,'can_edit_formal'),
    can_edit_cartas:userPerm(user,'can_edit_cartas'),
    can_import:userPerm(user,'can_import'),
    can_notify:userPerm(user,'can_notify'),
    can_manage_users:userPerm(user,'can_manage_users'),
    can_see_all:userPerm(user,'can_see_all'),
    vista_parcial:userPerm(user,'vista_parcial'),
    solo_lectura_cartas:userPerm(user,'solo_lectura_cartas')
  }:null;
  const chip=document.getElementById('userChip');
  const ban=document.getElementById('scopeBanner');
  const tabU=document.getElementById('tabUsuarios');
  const tabC=document.getElementById('tabConfiguracion');
  const btnU=document.getElementById('btnUsersAdmin');
  if(!user){
    if(chip)chip.style.display='none';
    if(ban)ban.style.display='none';
    if(tabU)tabU.style.display='none';
    if(tabC)tabC.style.display='none';
    if(btnU)btnU.style.display='none';
    return;
  }
  if(chip)chip.style.display='flex';
  document.getElementById('userChipName').textContent=user.nombre||user.username;
  const esp=(user.especialidades||[]).join(', ')||'todas';
  document.getElementById('userChipRol').textContent=`${user.rol.toUpperCase()} · ${esp}`;
  const avatar=document.getElementById('userAvatar');
  if(avatar){
    const words=(user.nombre||user.username||'U').trim().split(/\s+/);
    const initials=words.length>1?(words[0][0]+words[1][0]):(words[0].slice(0,2));
    avatar.textContent=initials.toUpperCase();
  }
  const reimp=document.getElementById('btnReimport');
  const reimpF=document.getElementById('btnReimportFooter');
  if(reimp)reimp.style.display=user.can_import?'':'none';
  if(reimpF)reimpF.style.display=user.can_import?'':'none';
  const cfgMaint=document.getElementById('cfgMaintenanceSec');
  if(cfgMaint)cfgMaint.style.display=user.can_import?'':'none';
  const btnNew = document.getElementById('btnNewCarta');
  if(btnNew) btnNew.style.display = userPerm(user,'can_create_cartas') ? '' : 'none';
  if(tabU)tabU.style.display=user.can_manage_users?'flex':'none';
  if(tabC)tabC.style.display=user.can_manage_users?'flex':'none';
  if(btnU)btnU.style.display=user.can_manage_users?'':'none';
  if(user.vista_parcial){
    ban.style.display='block';
    document.getElementById('scopeBannerText').textContent=
      `Solo lectura · especialidad(es) ${(user.especialidades||[]).join(', ')||'—'}. El Administrador registra cartas, respuestas (hilos) y cierres.`;
  }else if(user.solo_lectura_cartas && !user.can_create_cartas){
    ban.style.display='block';
    document.getElementById('scopeBannerText').textContent=
      'Modo consulta: puede ver todas las cartas. Crear, editar, responder (hilo) y borrar lo gestiona únicamente el Administrador.';
  }else{
    ban.style.display='none';
  }
}

async function fetchAuthMe(){
  const r=await fetch('/api/auth/me',{credentials:'same-origin'});
  if(!r.ok)throw new Error('auth/me');
  return r.json();
}

async function ensureSession(){
  const me=await fetchAuthMe();
  AUTH_REQUIRED=!!me.auth_required;
  if(me.authenticated&&me.user){
    applyUserChrome(me.user);
    if(me.user.must_change_password){
      hideLoginGate();
      showPwdGate();
      return false;
    }
    hidePwdGate();
    hideLoginGate();
    return true;
  }
  applyUserChrome(null);
  if(AUTH_REQUIRED){
    showLoginGate('');
    return false;
  }
  hideLoginGate();
  hidePwdGate();
  return true;
}
function confirmLogout(){
  confirmAction='logout';
  deleteId=null;
  toggleTargetUser=null;
  const uname=CURRENT_USER?(CURRENT_USER.nombre||CURRENT_USER.username):'tu cuenta';
  const titleEl=document.getElementById('confirmTitle');
  const msgEl=document.getElementById('confirmMsg');
  const okBtn=document.getElementById('btnConfirmOk');
  const overlay=document.getElementById('confirmOverlay');
  if(titleEl)titleEl.textContent='Cerrar sesión';
  if(msgEl)msgEl.innerHTML=`¿Estás seguro de que deseas salir del sistema?<br/><span style="font-size:12.5px;color:var(--text-muted);display:inline-block;margin-top:6px">Se cerrará la sesión activa de <strong>@${typeof escapeHtml==='function'?escapeHtml(uname):uname}</strong>.</span>`;
  if(okBtn){
    okBtn.disabled=false;
    okBtn.textContent='Cerrar sesión';
    okBtn.style.background='var(--rose)';
  }
  if(overlay)overlay.classList.add('active');
}

async function executeLogout(){
  const btn=document.getElementById('btnConfirmOk');
  if(btn){btn.disabled=true;btn.textContent='Cerrando…';}
  try{
    await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
  }catch(_){}
  finally{
    if(btn){btn.disabled=false;btn.textContent='Confirmar';}
    if(typeof closeConfirm==='function')closeConfirm();
    CURRENT_USER=null;
    ALL_CARTAS=[];
    filtered=[];
    applyUserChrome(null);
    hidePwdGate();
    showLoginGate('');
    if(typeof showToast==='function')showToast('Sesión cerrada correctamente','info');
  }
}
