
window.addEventListener('hashchange',()=>{
  const h=(location.hash||'').replace('#','');
  const isIng = CURRENT_USER && CURRENT_USER.rol === 'ingeniero';
  if(isIng){
    showView('pendientes');
    return;
  }
  showView(['cartas','pendientes','saldos','usuarios','configuracion'].includes(h)?h:'reportes');
});

try{
  if(!isMobileScreen() && localStorage.getItem('sidebar_collapsed') === '1'){
    document.getElementById('appSidebar')?.classList.add('collapsed');
  }
}catch(_){}
updateHeaderHeight();
fetchConfig();
const boot=(location.hash||'').replace('#','');
const isIngBoot = CURRENT_USER && CURRENT_USER.rol === 'ingeniero';
showView(isIngBoot ? 'pendientes' : (['cartas','pendientes','saldos','usuarios','configuracion'].includes(boot)?boot:'reportes'));
loadData();
