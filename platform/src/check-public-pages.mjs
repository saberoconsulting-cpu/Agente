import {chromium} from '../generated/browser/node_modules/playwright/index.mjs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const output=resolve(root,'platform/generated/local/legal-screenshots');await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  for(const base of ['http://127.0.0.1:5173','https://agente.saberoconsulting.com']) {
    for(const [path,title] of [['about','Un agente de ventas para tu empresa'],['privacy','Política de privacidad'],['terms','Términos y condiciones']]) {
      const response=await page.goto(`${base}/${path}`);
      if(response.status()!==200)throw new Error(`${base}/${path}: ${response.status()}`);
      await page.getByRole('heading',{name:title,exact:true}).waitFor();
      if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Mobile overflow');
      if(await page.getByRole('link',{name:'Privacidad',exact:true}).first().getAttribute('href')!=='/privacy')throw new Error('Missing privacy link');
      if(base.startsWith('https')) await page.screenshot({path:resolve(output,`${path}-public-mobile.png`),fullPage:true});
    }
  }
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('link',{name:'Privacidad',exact:true}).waitFor();
  await page.getByRole('button',{name:'Solicitar acceso empresarial',exact:true}).click();
  await page.getByRole('link',{name:'Términos y condiciones',exact:true}).waitFor();
  console.log('Public legal pages: local and HTTPS routes, anonymous access, mobile layout and login/application links OK.');
}finally{await browser.close();}
