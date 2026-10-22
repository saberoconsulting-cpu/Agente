import { chromium } from '../generated/browser/node_modules/playwright/index.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { parse } = require(resolve(root, 'backend/node_modules/dotenv'));
const env = parse(await readFile(resolve(root, 'backend/.env')));
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const output = resolve(root, 'platform/generated/local/screenshots');
await mkdir(output, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post('http://127.0.0.1:5173/api/v1/auth/login', { data: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD } });
  if (!login.ok()) throw new Error(`Browser login failed (${login.status()})`);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('heading', { name: 'Administración de SABERO' }).waitFor();
  await page.getByRole('button', { name: 'Ver empresa' }).first().waitFor();
  await page.screenshot({ path: resolve(output, 'administracion.png'), fullPage: true });
  await page.getByRole('button', { name: 'Ver empresa' }).first().click();
  await page.getByRole('heading', { name: 'Últimos contactos' }).waitFor();
  await page.getByRole('button', { name: 'Inicio', exact: true }).click();
  await page.getByRole('heading', { name: 'Tu negocio, de un vistazo' }).waitFor();
  await page.screenshot({ path: resolve(output, 'empresa.png'), fullPage: true });
  await page.getByRole('button', { name: 'Contactos', exact: true }).click();
  await page.getByRole('heading', { name: 'Contactos de tu empresa' }).waitFor();
  await page.getByRole('button', { name: 'Consumo de IA', exact: true }).click();
  await page.getByRole('heading', { name: 'Consumo de inteligencia artificial' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Abrir menu', exact: true }).click();
  await page.getByRole('button', { name: 'Empresas · SABERO', exact: true }).click();
  await page.getByRole('heading', { name: 'Administración de SABERO' }).waitFor();
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().right <= 0);
  await page.screenshot({ path: resolve(output, 'movil.png'), fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) {
    console.log(await page.evaluate(() => Array.from(document.querySelectorAll('main, main section, main div, main header')).map(element => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })).filter(element => element.width > innerWidth).slice(0, 12)));
    throw new Error('Mobile viewport has horizontal overflow');
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  console.log('Browser: admin listing, company detail, company dashboard, contacts, usage and mobile navigation OK. Screenshots saved locally.');
} finally { await browser.close(); }
