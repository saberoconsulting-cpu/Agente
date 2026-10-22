import {chromium} from '../generated/browser/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parse}=require('../../backend/node_modules/dotenv');
const env=parse(await readFile(new URL('../../backend/.env',import.meta.url)));
if(!['127.0.0.1','localhost'].includes(new URL(env.DATABASE_URL).hostname))throw new Error('Local database required');
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const login=await context.request.post('http://127.0.0.1:5173/api/v1/auth/login',{data:{email:env.ADMIN_EMAIL,password:env.ADMIN_PASSWORD}});
  if(!login.ok())throw new Error('Local login failed');
  const config=await(await context.request.get('http://127.0.0.1:5173/api/v1/integrations/google/picker-config')).json();
  if(!config.enabled||config.app_id!=='1085978981794')throw new Error('Picker project configuration invalid');
  const page=await context.newPage();
  await page.route('**/integrations/google/picker-config?*',async route=>{await new Promise(done=>setTimeout(done,800));await route.continue();});
  await page.goto('http://127.0.0.1:5173');await page.getByRole('heading',{name:'Pulso de la plataforma',exact:true}).waitFor();await page.getByRole('button',{name:'Conocimiento',exact:true}).click();
  await page.getByText('Preparando el selector de Google…',{exact:true}).waitFor();
  if(await page.getByText('Google Picker aun no esta habilitado.',{exact:false}).count())throw new Error('False disabled warning remains');
  await page.getByRole('checkbox').check();
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Seleccionar documentos'))?.disabled===false,null,{timeout:25000});
  if(!await page.evaluate(()=>Boolean(window.google?.picker?.PickerBuilder&&window.google?.accounts?.oauth2)))throw new Error('Google libraries not loaded');
  await page.screenshot({path:new URL('../generated/local/google-picker-ready.png',import.meta.url).pathname.slice(1),fullPage:true});
  if(process.argv.includes('--ui-only')){
    console.log('Picker UI ready: correct project, Google libraries loaded, no false disabled warning. OAuth account authorization is a separate check.');
    await browser.close();process.exit(0);
  }
  const popupPromise=page.waitForEvent('popup',{timeout:10000});
  await page.getByRole('button',{name:'Seleccionar documentos',exact:true}).click();
  const popup=await popupPromise;await popup.waitForLoadState('domcontentloaded');
  await popup.waitForTimeout(1500);
  const text=await popup.locator('body').innerText();
  const authError=['invalid_client','origin_mismatch','redirect_uri_mismatch','deleted_client'].find(code=>text.includes(code)||popup.url().includes(code));
  if(authError){
    console.log(text.split('\n').filter(line=>/oauth client|not found|origin|Error \d|invalid_client|cliente.*OAuth/i.test(line)).slice(0,5).join('\n'));
    throw new Error(`Google OAuth popup: ${authError}`);
  }
  console.log('Picker configuration and Google libraries ready. OAuth window opens. A real account must authorize Drive to complete file selection. No files read or changed.');
  await popup.close();
}finally{await browser.close();}
