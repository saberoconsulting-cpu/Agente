import {chromium} from '../generated/browser/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {Registry} from './registry.mjs';
import {decrypt} from './domain.mjs';
const require=createRequire(import.meta.url),{parse}=require('../../backend/node_modules/dotenv'),{verifyPassword}=require('../../backend/dist/src/modules/auth/password.js');
const env=parse(await readFile(new URL('../../backend/.env',import.meta.url))),admin=parse(await readFile(new URL('../.env',import.meta.url)));
for(const value of [env.DATABASE_URL,admin.CONTROL_DATABASE_URL])if(!['localhost','127.0.0.1'].includes(new URL(value).hostname))throw new Error('Local only');
const registry=new Registry(admin),key=randomUUID().slice(0,8),email=`password-${key}@example.test`,password=`Chosen-by-company-${randomUUID()}`;
let browser,tenant,requestId;
try{
  const company=(await registry.control.query("select * from platform_companies where id='solicitud-demo'")).rows[0];
  if(!company||!['localhost','127.0.0.1'].includes(new URL(decrypt(company.encrypted_connection,admin.PLATFORM_ENCRYPTION_KEY)).hostname))throw new Error('Prepared local tenant required');
  tenant=await registry.database(company);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext(),page=await context.newPage();await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button',{name:'Solicitar acceso empresarial',exact:true}).click();
  await page.getByLabel('Empresa',{exact:true}).fill(`Contraseña propia ${key}`);await page.getByLabel('Tu nombre',{exact:true}).fill('Cliente de prueba');await page.getByRole('button',{name:'Continuar',exact:true}).click();
  await page.getByLabel('Correo',{exact:true}).fill(email);await page.getByRole('button',{name:'País o territorio',exact:true}).click();
  await page.getByRole('combobox',{name:'Buscar país o código'}).fill('canada');await page.getByRole('combobox',{name:'Buscar país o código'}).press('Enter');
  await page.getByLabel('Número nacional',{exact:true}).fill('4165550123');await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Enviar solicitud',exact:true}).click();await page.getByText('Todavía no se ha creado una cuenta activa.',{exact:true}).waitFor();
  const row=(await registry.control.query('select id,password_hash from platform_access_requests where email=$1',[email])).rows[0];requestId=row?.id;
  if(!requestId||!verifyPassword(password,row.password_hash)||row.password_hash===password)throw new Error('Registration hash incorrect');
  if((await tenant.query('select id from agent.admin_users where email=$1',[email])).rowCount)throw new Error('Pending account was activated');
  const login=await context.request.post('http://127.0.0.1:5173/api/v1/auth/login',{data:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});if(!login.ok())throw new Error('Admin login failed');
  const cookies=await context.cookies(),csrf=decodeURIComponent(cookies.find(item=>item.name==='sabero_csrf').value);
  const headers={'X-CSRF-Token':csrf};
  const list=await(await context.request.get('http://127.0.0.1:5173/api/v1/platform/admin/access-requests')).json();
  if(JSON.stringify(list).includes(row.password_hash)||JSON.stringify(list).includes(password))throw new Error('Password leaked to admin');
  for(const data of [{action:'approve',payment_confirmed:true,payment_reference:'PRUEBA-SIN-COBRO'},{action:'activate',target_company_id:'solicitud-demo',password:'Administrator-must-not-replace-this',password_hash:'scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128)}]){
    const result=await context.request.post(`http://127.0.0.1:5173/api/v1/platform/admin/access-requests/${requestId}`,{headers,data});if(!result.ok())throw new Error(`Decision failed ${result.status()}`);
  }
  const activated=(await tenant.query('select password_hash from agent.admin_users where email=$1',[email])).rows[0];
  if(!activated||!verifyPassword(password,activated.password_hash)||verifyPassword('Administrator-must-not-replace-this',activated.password_hash))throw new Error('Activation changed the chosen password');
  console.log('Registration password OK: real public form, secure hash, pending account, no password in admin response, activation preserves company password and ignores administrator replacements. No real email sent.');
}finally{
  if(browser)await browser.close();
  if(tenant&&requestId){await tenant.query('delete from platform.agent_access_activations where request_id=$1',[requestId]);await tenant.query('delete from agent.admin_users where email=$1',[email]);}
  await registry.control.query('delete from platform_access_requests where email=$1',[email]);await registry.close();
}
