function showUserModal(){
  const o=document.getElementById('userModalOverlay');
  userModalClosing=false;
  o.classList.remove('closing');
  o.classList.add('active');
}
function closeUserModal(cb){
  const o=document.getElementById('userModalOverlay');
  if(!o.classList.contains('active')||userModalClosing){cb&&cb();return;}
  userModalClosing=true;
  o.classList.add('closing');
  setTimeout(()=>{
    o.classList.remove('active','closing');
    userModalClosing=false;
    editingUserId=null;
    cb&&cb();
  },160);
}
function syncUserFormRol(){
  const rol=document.getElementById('uf_rol').value;
  const espsWrap=document.getElementById('uf_espsWrap');
  const descEl=document.getElementById('uf_rolDesc');
  if(espsWrap)espsWrap.style.display=rol==='ingeniero'?'':'none';
  if(rol==='ingeniero')populateUserEspSelect(getUserEspSelections());
  const descs={
    ingeniero:'<strong>👷 Ingeniero Especialista:</strong> Solo lectura de las cartas de sus especialidades. No crea, edita ni cierra trámites.',
    residente:'<strong>📋 Residente de Obra:</strong> Consulta todas las bandejas y especialidades. El ciclo de cartas (crear, responder, cerrar hilo) lo maneja solo el Administrador.',
    admin:'<strong>🔑 Administrador:</strong> Único operador del ciclo: crea la carta, registra la respuesta (nueva carta con antecedentes → hilo), corrige errores de tipado y cierra el hilo completo.'
  };
  if(descEl)descEl.innerHTML=descs[rol]||'';
}

function openUserModal(user){
  editingUserId=user?user.id:null;
  const isEdit=!!user;
  document.getElementById('userModalTitle').textContent=isEdit?(`Editar Usuario: ${user.username}`):'Nuevo Usuario';
  const sub=document.getElementById('userModalSub');
  if(sub)sub.textContent=isEdit
    ?'Modifica los datos, rol o restablece la contraseña de esta cuenta'
    :'Registra una nueva cuenta de acceso al sistema con su rol y especialidad';
  document.getElementById('btnUserSave').textContent=isEdit?'Actualizar datos':'Crear usuario';
  document.getElementById('uf_id').value=isEdit?user.id:'';
  
  const uname=document.getElementById('uf_username');
  uname.value=isEdit?user.username:'';
  uname.readOnly=isEdit;
  
  document.getElementById('uf_nombre').value=isEdit?user.nombre:'';
  document.getElementById('uf_rol').value=isEdit?user.rol:'ingeniero';
  populateUserEspSelect(isEdit?(user.especialidades||[]):[]);
  
  const pwdInp=document.getElementById('uf_password');
  const pwdResetInp=document.getElementById('uf_password_reset');
  if(pwdInp){pwdInp.value='';pwdInp.type='password';}
  if(pwdResetInp){pwdResetInp.value='';pwdResetInp.type='password';}
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn=>{
    btn.innerHTML='<i class="ri-eye-line"></i>';
  });
  
  document.getElementById('uf_must').checked=true;
  document.getElementById('uf_must_reset').checked=true;
  
  document.getElementById('uf_usernameWrap').style.display=isEdit?'none':'';
  const nombreWrap=document.getElementById('uf_nombreWrap');
  if(nombreWrap)nombreWrap.className=isEdit?'form-group full-width':'form-group';
  
  document.getElementById('uf_pwdCreateWrap').style.display=isEdit?'none':'';
  document.getElementById('uf_pwdResetWrap').style.display=isEdit?'':'none';
  
  syncUserFormRol();
  showUserModal();
}

document.querySelectorAll('.btn-toggle-pwd').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const targetId=btn.dataset.target;
    const inp=document.getElementById(targetId);
    if(!inp)return;
    const isPwd=inp.type==='password';
    inp.type=isPwd?'text':'password';
    btn.innerHTML=isPwd?'<i class="ri-eye-off-line"></i>':'<i class="ri-eye-line"></i>';
  });
});
async function handleUserSave(){
  const btn = document.getElementById('btnUserSave');
  const isEdit = editingUserId != null;
  const nombre = document.getElementById('uf_nombre').value.trim();
  const rol = document.getElementById('uf_rol').value;
  const espsList = rol === 'ingeniero' ? getUserEspSelections() : [];

  if (!nombre) { showToast('El nombre y cargo son obligatorios', 'error'); return; }
  if (nombre.length > 100) { showToast('El nombre y cargo no pueden superar los 100 caracteres', 'error'); return; }
  if (rol === 'ingeniero' && !espsList.length) {
    showToast('Seleccione al menos una especialidad del catálogo para el ingeniero', 'error');
    document.getElementById('uf_esps')?.focus();
    return;
  }
  if (espsList.length > 12) { showToast('Máximo 12 especialidades por usuario', 'error'); return; }

  if (!isEdit) {
    const username = document.getElementById('uf_username').value.trim();
    const password = document.getElementById('uf_password').value;
    if (!username) { showToast('El nombre de usuario (login) es obligatorio', 'error'); return; }
    if (username.length < 3 || username.length > 60) {
      showToast('El usuario debe tener entre 3 y 60 caracteres', 'error');
      return;
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      showToast('El usuario solo puede contener letras, números, puntos, guiones y sin espacios', 'error');
      return;
    }
    if (!password) { showToast('La contraseña inicial es obligatoria', 'error'); return; }
    if (password.length < 8 || password.length > 128) {
      showToast('La contraseña debe tener entre 8 y 128 caracteres', 'error');
      return;
    }
  } else {
    const pwReset = document.getElementById('uf_password_reset').value;
    if (pwReset && (pwReset.length < 8 || pwReset.length > 128)) {
      showToast('La nueva contraseña debe tener entre 8 y 128 caracteres', 'error');
      return;
    }
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    if (isEdit) {
      const body = { nombre, rol, especialidades: espsList };
      const r = await apiFetch('/api/auth/users/' + editingUserId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo actualizar el usuario');
      
      const pwReset = document.getElementById('uf_password_reset').value;
      if (pwReset) {
        const rp = await apiFetch('/api/auth/users/' + editingUserId + '/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pwReset, must_change_password: document.getElementById('uf_must_reset').checked })
        });
        const rd = await rp.json().catch(() => ({}));
        if (!rp.ok) throw new Error(rd.error || 'Usuario guardado pero falló el reset de clave');
      }
      closeUserModal();
      showToast('Usuario actualizado correctamente', 'success');
      await loadUsersAdmin();
    } else {
      const username = document.getElementById('uf_username').value.trim();
      const password = document.getElementById('uf_password').value;
      const body = {
        username,
        nombre,
        rol,
        especialidades: espsList,
        password,
        must_change_password: document.getElementById('uf_must').checked
      };
      const r = await apiFetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se pudo crear el usuario');
      closeUserModal();
      showToast('Usuario creado: ' + d.user.username, 'success');
      await loadUsersAdmin();
    }
  } catch (ex) {
    showToast(ex.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = isEdit ? 'Actualizar' : 'Crear usuario';
  }
}

let usersTableQuery='';

function showUsersLoading(show=true){
  const bar=document.getElementById('usersProgressBar');
  if(bar)bar.classList.toggle('active',show);
}

function renderUsersSkeleton(count=6){
  showUsersLoading(true);
  const tb=document.getElementById('usersTableBody');
  if(!tb)return;
  let html='';
  for(let i=0;i<count;i++){
    html+=`
      <tr class="skeleton-row">
        <td><div style="display:flex;align-items:center;gap:8px"><div class="skeleton" style="width:28px;height:28px;border-radius:50%"></div><div class="skeleton skeleton-pill" style="width:75px"></div></div></td>
        <td><div class="skeleton skeleton-text" style="width:140px"></div></td>
        <td><div class="skeleton skeleton-pill" style="width:85px"></div></td>
        <td><div class="skeleton skeleton-pill" style="width:110px"></div></td>
        <td><div class="skeleton skeleton-pill" style="width:65px"></div></td>
        <td><div class="skeleton skeleton-pill" style="width:75px"></div></td>
        <td style="text-align:right"><div class="skeleton skeleton-badge" style="width:130px"></div></td>
      </tr>`;
  }
  tb.innerHTML=html;
}

function setUsersPage(page){
  usersPage=page;
  renderUsersTable();
}

function updateUsersPagination(start,shown,total){
  const bar=document.getElementById('usersPaginationBar');
  const info=document.getElementById('usersPaginationInfo');
  const ctrl=document.getElementById('usersPaginationControls');
  if(!bar||!info||!ctrl)return;
  bar.style.display='flex';
  if(!total){
    info.innerHTML='<span style="color:var(--text-muted)">Sin resultados</span>';
    ctrl.innerHTML='';
    return;
  }
  const pages=Math.max(1,Math.ceil(total/USERS_PAGE_SIZE));
  const startItem=start+1;
  const endItem=Math.min(start+shown,total);
  info.innerHTML=`
    <span style="font-weight:500">Mostrando <strong style="color:var(--text-primary);font-weight:700">${startItem}–${endItem}</strong> de <strong style="color:var(--text-primary);font-weight:700">${total}</strong> usuarios</span>
    <span class="badge-soft" style="font-size:11px;padding:3px 8px;font-weight:700;color:var(--text-secondary);background:#ECE8E1;border:1px solid #DFD9CE;border-radius:5px">
      Página ${usersPage} de ${pages}
    </span>`;
  ctrl.innerHTML='';
  const mkBtn=(html,page,disabled=false,active=false,title='')=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='btn-page'+(active?' active':'');
    b.innerHTML=html;
    b.disabled=disabled;
    if(title)b.title=title;
    b.onclick=()=>setUsersPage(page);
    ctrl.appendChild(b);
  };
  const mkEllipsis=()=>{
    const span=document.createElement('span');
    span.className='btn-page-ellipsis';
    span.textContent='…';
    ctrl.appendChild(span);
  };

  // Primera y Anterior
  mkBtn('<i class="ri-skip-back-mini-line"></i>',1,usersPage<=1,false,'Primera página');
  mkBtn('<i class="ri-arrow-left-s-line"></i>',usersPage-1,usersPage<=1,false,'Página anterior');

  // Numéricos con elipsis
  if(pages<=7){
    for(let p=1;p<=pages;p++)mkBtn(String(p),p,false,p===usersPage,`Página ${p}`);
  } else {
    mkBtn('1',1,false,usersPage===1,'Página 1');
    let from=Math.max(2,usersPage-1);
    let to=Math.min(pages-1,usersPage+1);
    if(usersPage<=3){from=2;to=4;}
    else if(usersPage>=pages-2){from=pages-3;to=pages-1;}
    if(from>2)mkEllipsis();
    for(let p=from;p<=to;p++)mkBtn(String(p),p,false,p===usersPage,`Página ${p}`);
    if(to<pages-1)mkEllipsis();
    mkBtn(String(pages),pages,false,usersPage===pages,`Página ${pages}`);
  }

  // Siguiente y Última
  mkBtn('<i class="ri-arrow-right-s-line"></i>',usersPage+1,usersPage>=pages,false,'Página siguiente');
  mkBtn('<i class="ri-skip-forward-mini-line"></i>',pages,usersPage>=pages,false,`Última página (Pág. ${pages})`);

  if(pages>1){
    const jumpWrap=document.createElement('div');
    jumpWrap.className='pagination-jump-wrap';
    const jumpLabel=document.createElement('label');
    jumpLabel.htmlFor='usersPageJump';
    jumpLabel.className='pagination-jump-label';
    jumpLabel.textContent='Ir a:';
    const jumpSelect=document.createElement('select');
    jumpSelect.id='usersPageJump';
    jumpSelect.className='pagination-select';
    jumpSelect.setAttribute('aria-label','Seleccionar página de usuarios');
    for(let p=1;p<=pages;p++){
      const opt=document.createElement('option');
      opt.value=p;
      const pStart=(p-1)*USERS_PAGE_SIZE+1;
      const pEnd=Math.min(p*USERS_PAGE_SIZE,total);
      opt.textContent=`Pág. ${p} (${pStart}–${pEnd})`;
      if(p===usersPage)opt.selected=true;
      jumpSelect.appendChild(opt);
    }
    jumpSelect.onchange=(e)=>{
      const targetPage=parseInt(e.target.value,10);
      if(!isNaN(targetPage)&&targetPage>=1&&targetPage<=pages){
        setUsersPage(targetPage);
      }
    };
    jumpWrap.appendChild(jumpLabel);
    jumpWrap.appendChild(jumpSelect);
    ctrl.appendChild(jumpWrap);
  }
}

function renderUsersTable(){
  showUsersLoading(false);
  const tb=document.getElementById('usersTableBody');
  if(!tb)return;
  
  const q=usersTableQuery.trim().toLowerCase();
  let list=USERS_ADMIN||[];
  if(q){
    list=list.filter(u=>{
      const esps=(u.especialidades||[]).join(' ').toLowerCase();
      return (u.username||'').toLowerCase().includes(q)
        || (u.nombre||'').toLowerCase().includes(q)
        || (u.rol||'').toLowerCase().includes(q)
        || esps.includes(q);
    });
  }
  
  const total=list.length;
  const countEl=document.getElementById('usersCountInline');
  if(countEl)countEl.textContent=total;
  const hintEl=document.getElementById('usersSearchHint');
  if(hintEl){
    hintEl.textContent=q?`${total} de ${USERS_ADMIN.length} usuarios`:'';
  }
  
  const totalPages=Math.max(1,Math.ceil(total/USERS_PAGE_SIZE));
  if(usersPage>totalPages)usersPage=totalPages;
  if(usersPage<1)usersPage=1;
  const start=(usersPage-1)*USERS_PAGE_SIZE;
  const pageList=list.slice(start,start+USERS_PAGE_SIZE);
  
  tb.innerHTML='';
  if(!total){
    tb.innerHTML=`<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:32px 16px"><i class="ri-user-search-line" style="font-size:24px;display:block;margin-bottom:6px;opacity:0.6"></i>No se encontraron usuarios${q?` con el filtro "${escapeHtml(usersTableQuery)}"`:''}</td></tr>`;
    updateUsersPagination(0,0,0);
    return;
  }
  
  pageList.forEach((u,idx)=>{
    const tr=document.createElement('tr');
    tr.className='row-rendered';
    tr.style.animationDelay=`${Math.min(idx*15,200)}ms`;
    
    // Rol badge using cartas status-badge
    const rolClass=u.rol==='admin'?'abierto':u.rol==='residente'?'cerrado':'otro';
    const rolBadge=`<span class="status-badge ${rolClass}">${escapeHtml(u.rol)}</span>`;
    
    // Especialidades text like cartas table
    const esps=(u.especialidades||[]).join(', ')||'—';
    
    // Estado badge using cartas status-badge
    const stBadge=u.activo
      ?`<span class="status-badge cerrado">Activo</span>`
      :`<span class="status-badge otro">Inactivo</span>`;
      
    // Clave badge using cartas status-badge
    const keyBadge=u.must_change_password
      ?`<span class="status-badge observado">Debe cambiar</span>`
      :`<span class="status-badge cerrado">OK</span>`;
      
    // Acciones buttons using clean standard buttons
    const actBtn=u.activo
      ?`<button type="button" class="btn-logout" data-act="toggle" data-id="${u.id}" data-activo="1">Desactivar</button>`
      :`<button type="button" class="btn-logout" data-act="toggle" data-id="${u.id}" data-activo="0">Activar</button>`;
      
    tr.innerHTML=`
      <td><code>${escapeHtml(u.username)}</code></td>
      <td>${escapeHtml(u.nombre)}</td>
      <td>${rolBadge}</td>
      <td class="cell-wrap">${escapeHtml(esps)}</td>
      <td>${stBadge}</td>
      <td>${keyBadge}</td>
      <td style="text-align:right;white-space:nowrap">
        <div style="display:inline-flex;gap:6px;justify-content:flex-end">
          <button type="button" class="btn-logout" data-act="edit" data-id="${u.id}">Editar</button>
          ${actBtn}
        </div>
      </td>`;
    tb.appendChild(tr);
  });
  
  tb.querySelectorAll('button[data-act]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const id=parseInt(btn.dataset.id,10);
      const u=USERS_ADMIN.find(x=>x.id===id);
      if(btn.dataset.act==='edit'){
        if(u)openUserModal(u);
        return;
      }
      if(btn.dataset.act==='toggle'){
        if(!u)return;
        const nextActivo=btn.dataset.activo==='1'?false:true;
        confirmToggleUser(u,nextActivo);
      }
    });
  });

  updateUsersPagination(start,pageList.length,total);
}

const usersTableQ=document.getElementById('usersTableQ');
const usersTableQClear=document.getElementById('usersTableQClear');
if(usersTableQ){
  usersTableQ.addEventListener('input',()=>{
    usersTableQuery=usersTableQ.value;
    usersPage=1;
    if(usersTableQClear)usersTableQClear.classList.toggle('visible',!!usersTableQuery);
    renderUsersTable();
  });
}
if(usersTableQClear){
  usersTableQClear.addEventListener('click',()=>{
    usersTableQuery='';
    usersPage=1;
    if(usersTableQ)usersTableQ.value='';
    usersTableQClear.classList.remove('visible');
    renderUsersTable();
    if(usersTableQ)usersTableQ.focus();
  });
}

async function loadUsersAdmin(){
  if(!(CURRENT_USER&&CURRENT_USER.can_manage_users))return;
  renderUsersSkeleton(6);
  try{
    const r=await apiFetch('/api/auth/users');
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||'Error al cargar usuarios');
    if(d.catalogo)CATALOGO=d.catalogo;
    USERS_ADMIN=d.users||[];
    renderUsersTable();
  }catch(e){
    showUsersLoading(false);
    showToast('Usuarios: '+e.message,'error');
  }
}

// ==================== CONFIGURACIÓN DEL SISTEMA (BRANDING & REGLAS) ====================
let SYSTEM_CONFIG = null;
let pendingLogoBase64 = null;
let pendingFaviconBase64 = null;
let pendingBannerWordBase64 = null;
