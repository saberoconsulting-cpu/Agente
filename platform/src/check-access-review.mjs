import {chromium} from '../generated/browser/node_modules/playwright/index.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {Registry} from './registry.mjs';
import {decrypt} from './domain.mjs';
const require=createRequire(import.meta.url),{parse}=require('../../backend/node_modules/dotenv');
const env=parse(await readFile(new URL('../../backend/.env',import.meta.url)));
const admin=parse(await readFile(new URL('../.env',import.meta.url)));
for(const value of [env.DATABASE_URL,admin.CONTROL_DATABASE_URL])if(!['localhost','127.0.0.1'].includes(new URL(value).hostname))throw new Error('Local databases required');
const registry=new Registry(admin),ids=[randomUUID(),randomUUID()],key=randomUUID().slice(0,8),email=`review-${key}@example.test`;
const password=`Review-${randomUUID()}`;
const {hashPassword,verifyPassword}=require('../../backend/dist/src/modules/auth/password.js');
const registrationHash=hashPassword(password);
let browser,tenant;
try {
  const company=(await registry.control.query("select * from platform_companies where id='solicitud-demo' and status='active' and deleted_at is null")).rows[0];
  if(!company||!['localhost','127.0.0.1'].includes(new URL(decrypt(company.encrypted_connection,admin.PLATFORM_ENCRYPTION_KEY)).hostname))throw new Error('Prepared local demonstration company required');
  tenant=await registry.database(company);
  for(let index=0;index<ids.length;index++)await registry.control.query('insert into platform_access_requests(id,business_name,contact_name,email,phone,origin_company_id,password_hash) values($1,$2,$3,$4,$5,$6,$7)',[ids[index],`Revisión ${key} ${index}`,'Contacto de prueba',index?`reject-${email}`:email,'+14165550123',env.COMPANY_ID,registrationHash]);
  browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const login=await context.request.post('http://127.0.0.1:5173/api/v1/auth/login',{data:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});if(!login.ok())throw new Error('Admin login failed');
  const page=await context.newPage();await page.goto('http://127.0.0.1:5173');
  const fromCompanies=process.argv.includes('--from-companies');
  if(fromCompanies){
    await page.getByRole('heading',{name:'Pulso de la plataforma',exact:true}).waitFor();
    await page.getByRole('button',{name:'SABERO Desarrollo',exact:true}).click();
    await page.getByRole('dialog').getByRole('heading',{name:'Datos de la empresa',exact:true}).waitFor();
    if(await page.getByRole('dialog').getByRole('button',{name:'Suspender acceso',exact:true}).count())throw new Error('Administrator account is not protected');
    await page.getByRole('button',{name:'Cerrar ficha de empresa',exact:true}).click();
  }else{
    await page.getByRole('button',{name:'Solicitudes de acceso',exact:true}).click();
    await page.getByLabel('Buscar solicitudes').fill(key);
  }
  const output=new URL('../generated/local/',import.meta.url);await mkdir(output,{recursive:true});
  await page.screenshot({path:new URL('solicitudes-lista-elegante.png',output).pathname.slice(1),fullPage:true});
  await page.getByRole('button',{name:`${fromCompanies?'Validar ':''}Revisión ${key} 0`,exact:true}).click();
  await page.getByRole('dialog',{name:'Validar empresa',exact:true}).waitFor();
  await page.getByRole('heading',{name:`Revisión ${key} 0`,exact:true}).waitFor();
  await page.getByLabel('Referencia del pago').fill('PRUEBA-LOCAL-SIN-COBRO');
  if(await page.getByRole('button',{name:'Aprobar y notificar',exact:true}).isEnabled())throw new Error('Payment checkbox was bypassed');
  await page.getByRole('checkbox').check();
  await page.screenshot({path:new URL('solicitud-revision-elegante.png',output).pathname.slice(1),fullPage:true});
  await page.getByRole('button',{name:'Aprobar y notificar',exact:true}).click();
  await page.getByRole('button',{name:'Habilitar acceso y notificar',exact:true}).waitFor();
  await page.getByLabel('Empresa',{exact:true}).selectOption('solicitud-demo');
  if(await page.getByRole('dialog').locator('input[type=password]').count())throw new Error('Administrator is still asked for a password');
  await page.getByRole('button',{name:'Habilitar acceso y notificar',exact:true}).click();
  await page.getByText('La empresa ya tiene acceso',{exact:true}).waitFor();
  const user=(await tenant.query('select id,company_id,role,password_hash from agent.admin_users where email=$1',[email])).rows[0];
  if(user?.company_id!=='solicitud-demo'||user.role!=='owner'||!verifyPassword(password,user.password_hash))throw new Error('Company activation failed');
  const notices=(await registry.control.query('select decision,status,payload from platform_access_notifications where request_id=$1 order by created_at',[ids[0]])).rows;
  if(notices.length!==2||notices.some(item=>item.status!=='skipped'))throw new Error('Approval/activation notifications not durably recorded or test addresses sent');
  if(JSON.stringify(notices).includes(password)||JSON.stringify(notices).includes('password_hash'))throw new Error('Credentials leaked into notification queue');
  await page.getByRole('button',{name:'Todas las solicitudes',exact:true}).click();
  await page.getByRole('button',{name:`${fromCompanies?'Validar ':''}Revisión ${key} 1`,exact:true}).click();
  await page.getByRole('button',{name:'Rechazar',exact:true}).click();
  await page.getByLabel('Motivo para la empresa',{exact:false}).fill('Necesitamos completar la información de tu negocio.');
  await page.getByRole('button',{name:'Rechazar y notificar',exact:true}).click();
  await page.getByText('La solicitud fue rechazada',{exact:true}).waitFor();
  const rejected=(await registry.control.query('select status,payload from platform_access_notifications where request_id=$1',[ids[1]])).rows[0];
  if(rejected?.status!=='skipped'||!rejected.payload.rejection_reason)throw new Error('Rejection reason missing from notification');
  await page.screenshot({path:new URL('solicitud-rechazada-elegante.png',output).pathname.slice(1),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(300);
  await page.screenshot({path:new URL('solicitud-revision-mobile.png',output).pathname.slice(1),fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)){
    console.log(await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).filter(element=>element.getBoundingClientRect().right>innerWidth).slice(0,10).map(element=>({tag:element.tagName,classes:element.className,width:element.getBoundingClientRect().width}))));
    throw new Error('Mobile review overflow');
  }
  console.log('Review UI OK: company click, payment approval, separate company activation, rejection reason, persistent notifications, fixture mail suppression and mobile layout. No real email sent.');
} finally {
  if(browser)await browser.close();
  if(tenant){await tenant.query('delete from platform.agent_access_activations where request_id=any($1::uuid[])',[ids]);await tenant.query('delete from agent.admin_users where email=$1',[email]);}
  await registry.control.query('delete from platform_access_requests where id=any($1::uuid[])',[ids]);
  await registry.close();
}
