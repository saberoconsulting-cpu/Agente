import {chromium} from '../generated/browser/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('../../backend/node_modules/dotenv');
const env=parse(await readFile(new URL('../../backend/.env',import.meta.url)));
if(!['localhost','127.0.0.1'].includes(new URL(env.DATABASE_URL).hostname))throw new Error('Local only');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}});
  const login=await context.request.post('http://127.0.0.1:5173/api/v1/auth/login',{data:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});if(!login.ok())throw new Error('Local login failed');
  const page=await context.newPage();let polls=0;
  page.on('request',request=>{if(request.url().endsWith('/platform/admin/companies'))polls++;});
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('heading',{name:'Pulso de la plataforma'}).waitFor();
  await page.getByText(/^Actualizado \d/).waitFor();
  if(await page.locator('header').getByRole('button',{name:'Salir',exact:true}).count())throw new Error('Exit remains in header');
  const initial=await context.request.get('http://127.0.0.1:5173/api/v1/platform/admin/companies');
  if(!initial.ok())throw new Error('Overview failed');
  const data=await initial.json();
  if(!data.items.some(item=>item.metrics&&item.activity.length===7))throw new Error('No connected company with a historical series');
  for(const company of data.items.filter(item=>item.metrics)){
    if(company.activity.length!==7)throw new Error('Missing historical days');
    if(company.activity.some(day=>!/^\d{4}-\d{2}-\d{2}$/.test(day.date)||day.requests<0||Number(day.tokens)<0))throw new Error('Invalid daily series');
  }
  await page.getByRole('img',{name:'Gráfica de llamadas de los últimos siete días'}).waitFor();
  const next=page.waitForResponse(response=>response.url().endsWith('/platform/admin/companies')&&response.ok(),{timeout:14000});
  await next;
  if(polls<2)throw new Error('No automatic refresh');
  if(await page.getByLabel('Buscar empresas').inputValue()!=='')throw new Error('Unexpected search reset');
  await page.getByRole('button',{name:'Tokens',exact:true}).click();
  await page.getByRole('img',{name:'Gráfica de tokens de los últimos siete días'}).waitFor();
  await page.screenshot({path:new URL('../generated/local/empresas-graficas-desktop.png',import.meta.url).pathname.slice(1),fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile chart overflow');
  await page.screenshot({path:new URL('../generated/local/empresas-graficas-mobile.png',import.meta.url).pathname.slice(1),fullPage:true});
  console.log('Company charts OK: seven historical days, real API series, automatic polling, metric toggle, header and mobile layout. No data modified.');
}finally{await browser.close();}
