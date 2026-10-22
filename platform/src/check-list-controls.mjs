// Local-only checks. Every record created here is removed in finally.
import {chromium} from '../generated/browser/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const require=createRequire(import.meta.url),{parse}=require('../../backend/node_modules/dotenv');
const env=parse(await readFile(new URL('../../backend/.env',import.meta.url)));
const runtime=parse(await readFile(new URL('../.env.runtime',import.meta.url)));
for(const value of [env.DATABASE_URL,runtime.CONTROL_DATABASE_URL])if(!['127.0.0.1','localhost'].includes(new URL(value).hostname))throw new Error('Local databases required');
const tenant=new pg.Pool({connectionString:env.DATABASE_URL,ssl:false,options:'-c search_path=agent,public'});
const control=new pg.Pool({connectionString:runtime.CONTROL_DATABASE_URL,ssl:false});
const ids=Array.from({length:13},()=>randomUUID()),leadId=randomUUID(),fileId=randomUUID(),key=randomUUID().slice(0,8);
const companyId=`list-${key}`;
const base='http://127.0.0.1:3001/api/v1';
let browser,ownerHeaders,userId;
try {
  const login=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD})});
  if(!login.ok)throw new Error(`Login ${login.status}`);
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const csrf=decodeURIComponent(cookie.split('; ').find(value=>value.startsWith('sabero_csrf=')).split('=')[1]);
  ownerHeaders={cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'};
  const remove=async(resource,id,status=200)=>{const r=await fetch(`${base}/records/${resource}/${id}`,{method:'DELETE',headers:ownerHeaders});if(r.status!==status)throw new Error(`${resource} removal: expected ${status}, got ${r.status}`);};
  await remove('companies','sabero',400);
  const localAdmin=parse(await readFile(new URL('../.env',import.meta.url)));
  if(!['127.0.0.1','localhost'].includes(new URL(localAdmin.CONTROL_DATABASE_URL).hostname))throw new Error('Local fixture database required');
  const adminPool=new pg.Pool({connectionString:localAdmin.CONTROL_DATABASE_URL,ssl:false});
  try {
    await adminPool.query(`insert into platform_companies(id,name,sector,database_name,encrypted_connection,mongo_database,status)
      select $1,'Empresa temporal de prueba','general',$1,encrypted_connection,$1,'active' from platform_companies where id=$2`,[companyId,env.COMPANY_ID]);
    await remove('companies',companyId);
    const state=(await adminPool.query('select status,deleted_at from platform_companies where id=$1',[companyId])).rows[0];
    if(state?.status!=='suspended'||!state.deleted_at)throw new Error('Company removal did not disable access');
    const overview=await(await fetch(`${base}/platform/admin/companies`,{headers:ownerHeaders})).json();
    if(overview.items.some(item=>item.id===companyId))throw new Error('Removed company still listed');
  } finally {await adminPool.end();}
  const anonymous=await fetch(`${base}/records/contacts/${leadId}`,{method:'DELETE'});if(anonymous.status!==401)throw new Error('Anonymous deletion allowed');
  const missingCsrf=await fetch(`${base}/records/contacts/${leadId}`,{method:'DELETE',headers:{cookie}});if(missingCsrf.status!==403)throw new Error('Missing CSRF accepted');
  await tenant.query('insert into leads(id,company_id,whatsapp_number,name) values($1,$2,$3,$4)',[leadId,env.COMPANY_ID,`+1999${Date.now()}`,'Fixture de lista']);
  await remove('contacts',leadId);
  if((await tenant.query('select id from leads where id=$1',[leadId])).rowCount)throw new Error('Contact not removed');
  await tenant.query("insert into google_drive_files(id,company_id,google_file_id,name,mime_type,sync_status) values($1,$2,$3,'Fixture lista','application/pdf','pending')",[fileId,env.COMPANY_ID,`fixture-${key}`]);
  await remove('files',fileId);
  const files=await (await fetch(`${base}/google-drive/files`,{headers:ownerHeaders})).json();if(files.some(file=>file.id===fileId))throw new Error('Withdrawn file still listed');
  const email=`list-${key}@example.test`,password=`Fixture-${randomUUID()}`;
  const create=await fetch(`${base}/auth/users`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({email,password,role:'admin'})});
  if(!create.ok)throw new Error('Could not create isolated access fixture');
  userId=(await create.json()).id;
  const userLogin=await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  if(!userLogin.ok)throw new Error('Fixture user login failed');
  const userCookie=userLogin.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  await remove('users',userId);
  if((await fetch(`${base}/auth/me`,{headers:{cookie:userCookie}})).status!==401)throw new Error('Removed access remains authorized');
  for(let index=0;index<ids.length;index++)await control.query('insert into platform_access_requests(id,business_name,contact_name,email,phone,origin_company_id) values($1,$2,$3,$4,$5,$6)',[ids[index],`Lista ${key} ${index}`,'Prueba local',`list-${ids[index]}@example.test`,'+14165550123',env.COMPANY_ID]);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies(cookie.split('; ').map(value=>({name:value.split('=')[0],value:value.slice(value.indexOf('=')+1),url:'http://127.0.0.1:5173'})));
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button',{name:'Solicitudes de acceso',exact:true}).click();
  await page.getByRole('button',{name:'Página siguiente de solicitudes',exact:true}).waitFor();
  if(await page.locator('tbody tr').count()!==10)throw new Error('Request page not limited to 10');
  await page.getByRole('button',{name:'Página siguiente de solicitudes',exact:true}).click();
  if(await page.locator('tbody tr').count()>10)throw new Error('Next page exceeds page size');
  await page.getByRole('button',{name:'Página anterior de solicitudes',exact:true}).click();
  const removeButton=page.getByRole('button',{name:`Eliminar Lista ${key} 12`,exact:true});
  await removeButton.click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  if(!(await control.query('select id from platform_access_requests where id=$1 and deleted_at is null',[ids[12]])).rowCount)throw new Error('Cancel removed record');
  await removeButton.click();await page.getByRole('dialog').getByRole('button',{name:'Eliminar',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  if((await control.query('select id from platform_access_requests where id=$1 and deleted_at is null',[ids[12]])).rowCount)throw new Error('Confirmed request removal failed');
  await page.getByRole('button',{name:'Contraer menú',exact:true}).click();
  await page.waitForTimeout(250);
  if(Math.round((await page.locator('aside').boundingBox()).width)!==80)throw new Error('Collapsed menu width changed');
  await page.getByRole('button',{name:'Expandir menú',exact:true}).click();
  await page.waitForTimeout(250);
  if(Math.round((await page.locator('aside').boundingBox()).width)!==256)throw new Error('Expanded menu width incorrect');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Desktop horizontal overflow');
  console.log('Local checks passed: pagination, cancel/confirm removal, CSRF, protected admin, contact removal, document withdrawal, revoked access and sidebar.');
} finally {
  if(browser)await browser.close();
  // Runtime cannot DELETE control rows; restore cleanup through the local admin connection only.
  const admin=parse(await readFile(new URL('../.env',import.meta.url)));
  if(!['127.0.0.1','localhost'].includes(new URL(admin.CONTROL_DATABASE_URL).hostname))throw new Error('Local cleanup required');
  const cleanup=new pg.Pool({connectionString:admin.CONTROL_DATABASE_URL,ssl:false});
  try {await cleanup.query('delete from platform_access_requests where id=any($1::uuid[])',[ids]);await cleanup.query('delete from platform_companies where id=$1',[companyId]);}finally{await cleanup.end();}
  if(userId)await tenant.query('delete from admin_users where id=$1 and email like $2',[userId,`list-${key}@example.test`]);
  await tenant.query('delete from google_drive_files where id=$1',[fileId]);
  await tenant.query('delete from leads where id=$1',[leadId]);
  await Promise.all([tenant.end(),control.end()]);
}
