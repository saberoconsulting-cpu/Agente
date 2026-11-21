// End-to-end check using only the PDF already explicitly approved by the user.
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.tmpdir(), 'sabero-drive-browser-check', 'node_modules', 'playwright-core'));
const origin = 'https://agente.saberoconsulting.com';
const name = 'Presentacion_Institucional_Sabero_Consulting_Actualizada.pdf';
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith(origin));
  if (!page) throw new Error('No se encontro la pestaña de SABERO.');
  const startedRequests = new WeakMap();
  let registeredAt = Infinity, startedAt, latest, resolveIndexed;
  const indexed = new Promise(resolve => { resolveIndexed = resolve; });
  page.on('request', request => startedRequests.set(request, Date.now()));
  page.on('response', async response => {
    try {
      const url = new URL(response.url());
      if (url.origin !== origin || url.pathname !== '/api/v1/google-drive/files') return;
      if (response.request().method() === 'POST' && response.ok()) registeredAt = Date.now();
      if (response.request().method() !== 'GET' || !response.ok() || (startedRequests.get(response.request()) || 0) < registeredAt) return;
      const files = await response.json();
      const target = files.find(file => file.name === name);
      if (target?.sync_status !== latest) {
        latest = target?.sync_status;
        console.log(JSON.stringify({ event: 'automatic-ui-request', status: latest }));
      }
      if (latest === 'indexed') resolveIndexed();
    } catch { /* Ignore unrelated navigation responses. */ }
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.getByText('Conocimiento', { exact: true }).first().click({ timeout: 45000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Seleccionar documentos', exact: true }).click();
  await page.locator('iframe[src^="https://docs.google.com/picker"]').waitFor({ timeout: 45000 });
  const picker = page.frameLocator('iframe[src^="https://docs.google.com/picker"]');
  await picker.getByRole('textbox').first().fill('SABERO');
  await picker.getByRole('textbox').first().press('Enter');
  await picker.locator('[role="option"]:visible').filter({ hasText: name }).first().click();
  const registration = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/google-drive/files' && response.request().method() === 'POST' && response.status() !== 401, { timeout: 60000 });
  startedAt = Date.now();
  await picker.locator('[role="button"][aria-disabled="false"]:visible').filter({ hasText: /^Select$/ }).click();
  const saved = await registration;
  console.log(JSON.stringify({ event: 'registration', status: saved.status() }));
  if (!saved.ok()) throw new Error('No se pudo registrar el PDF.');
  await Promise.race([indexed, new Promise((_, reject) => setTimeout(() => reject(new Error('La indexacion no termino dentro del tiempo de prueba.')), 120000))]);
  const row = page.getByText(name, { exact: true }).first().locator('..').locator('..');
  await row.getByText(/^indexed$/i).waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(__dirname, 'performance-browser.png') });
  console.log(JSON.stringify({ event: 'AUTO_REFRESH_CONFIRMED', indexedInSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)) }));
  process.exit(0);
})().catch(error => { console.log(JSON.stringify({ event: 'error', message: error.message.split('\n')[0] })); process.exit(1); });
