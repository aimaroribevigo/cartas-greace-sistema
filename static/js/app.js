
window.addEventListener('hashchange',()=>{
  const h=(location.hash||'').replace('#','');
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
showView(['cartas','pendientes','saldos','usuarios','configuracion'].includes(boot)?boot:'reportes');
loadData();
