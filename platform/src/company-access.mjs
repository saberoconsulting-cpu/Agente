const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

export async function changeCompanyAccess(registry,id,body){
  if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id)||!['enable','suspend'].includes(body.action)||body.confirmed!==true)fail('Confirma la acción para esta empresa.');
  if(!registry.env.PLATFORM_ADMIN_COMPANY_ID||id===registry.env.PLATFORM_ADMIN_COMPANY_ID)fail('La cuenta administradora está protegida.',403);
  const company=(await registry.control.query('SELECT * FROM platform_companies WHERE id=$1 AND deleted_at IS NULL',[id])).rows[0];
  if(!company)fail('Empresa no disponible.',404);
  if(body.action==='enable'){
    if(company.status!=='suspended')fail('Solo se puede reactivar una empresa suspendida.',409);
    const product=await registry.control.query("SELECT 1 FROM platform_products WHERE company_id=$1 AND product='agent' AND status='active'",[id]);
    if(!product.rowCount)fail('Primero debe prepararse el agente de la empresa.',409);
    const owner=await(await registry.database(company)).query("SELECT 1 FROM agent.admin_users WHERE company_id=$1 AND role='owner' AND active LIMIT 1",[id]);
    if(!owner.rowCount)fail('Habilita primero al propietario desde su solicitud de acceso.',409);
  }else if(company.status!=='active')fail('Solo se puede suspender una empresa activa.',409);
  const status=body.action==='enable'?'active':'suspended';
  const result=await registry.control.query('UPDATE platform_companies SET status=$2 WHERE id=$1 AND status=$3 AND deleted_at IS NULL RETURNING id,status',[id,status,company.status]);
  if(!result.rowCount)fail('El estado cambió. Actualiza la ficha e inténtalo de nuevo.',409);
  return result.rows[0];
}
