
async function fetchCartas(){const r=await apiFetch('/api/cartas');if(!r.ok)throw new Error('Error cargando cartas');return r.json();}
async function fetchStats(){const r=await apiFetch('/api/stats');if(!r.ok)throw new Error('Error cargando estadísticas');return r.json();}
async function saveCarta(data){
  const edit=data.id!=null&&data.id!=='';
  const url=edit?'/api/cartas/'+data.id:'/api/cartas';
  const body={...data};delete body.id;
  const r=await apiFetch(url,{method:edit?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Error guardando carta');}
  return r.json();
}
async function deleteCarta(id){const r=await apiFetch('/api/cartas/'+id,{method:'DELETE'});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||'Error eliminando');}return r.json();}

