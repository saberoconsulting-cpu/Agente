import {chromium} from '../generated/browser/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Registry} from './registry.mjs';
import {decrypt} from './domain.mjs';
const require=createRequire(import.meta.url),{parse}=require('../../backend/node_modules/dotenv');
const env=parse(await readFile(new URL('../../backend/.env',import.meta.url))),admin=parse(await readFile(new URL('../.env',import.meta.url)));
for(const url of [env.DATABASE_URL,admin.CONTROL_DATABASE_URL])if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Local databases required');
const id=`access-${randomUUID().slice(0,8)}`,registry=new Registry(admin);
let browser,tenant;
try{
  const base=(await registry.control.query('select * from platform_companies where id=$1',[env.COMPANY_ID])).rows[0];
  if(!['localhost','127.0.0.1'].includes(new URL(decrypt(base.encrypted_connection,admin.PLATFORM_ENCRYPTION_KEY)).hostname))throw new Error('Local tenant required');
  tenant=await registry.database(base);
  await tenant.query('insert into agent.companies(id,name) values($1,$2)',[id,'Empresa temporal de validación']);
  await tenant.query("insert into agent.admin_users(company_id,email,password_hash,role,active) values($1,$2,'fixture-no-login','owner',true)",[id,`${id}@example.test`]);
  await registry.control.query("insert into platform_companies(id,name,sector,database_name,encrypted_connection,mongo_database,status) values($1,'Empresa temporal de validación','general',$1,$2,$1,'active')",[id,base.encrypted_connection]);
  await registry.control.query("insert into platform_products(company_id,product,status) values($1,'agent','active')",[id]);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const login=await context.request.post('http://127.0.0.1:5173/api/v1/auth/login',{data:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});if(!login.ok())throw new Error('Local login failed');
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173');
  await page.getByRole('heading',{name:'Pulso de la plataforma',exact:true}).waitFor();
  await page.getByRole('button',{name:'Empresa temporal de validación',exact:true}).click();
  const modal=page.getByRole('dialog');await modal.getByRole('heading',{name:'Datos de la empresa',exact:true}).waitFor();
  if(await modal.getByRole('button',{name:'Suspender acceso',exact:true}).isEnabled())throw new Error('Unconfirmed change enabled');
  await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Suspender acceso',exact:true}).click();
  await modal.getByRole('button',{name:'Habilitar acceso',exact:true}).waitFor();
  if((await registry.control.query('select status from platform_companies where id=$1',[id])).rows[0].status!=='suspended')throw new Error('Suspension not persisted');
  await modal.getByRole('checkbox').check();await modal.getByRole('button',{name:'Habilitar acceso',exact:true}).click();
  await modal.getByRole('status').filter({hasText:'Acceso empresarial habilitado'}).waitFor();
  if((await registry.control.query('select status from platform_companies where id=$1',[id])).rows[0].status!=='active')throw new Error('Reactivation not persisted');
  await page.getByRole('button',{name:'Cerrar ficha de empresa',exact:true}).click();
  console.log('Company modal OK: real temporary company, details, confirmation required, suspension and reactivation persisted. No real company access changed.');
}finally{
  if(browser)await browser.close();
  await registry.control.query('delete from platform_products where company_id=$1',[id]);await registry.control.query('delete from platform_companies where id=$1',[id]);
  if(tenant){await tenant.query('delete from agent.admin_users where company_id=$1',[id]);await tenant.query('delete from agent.companies where id=$1',[id]);}
  await registry.close();
}
