// Select only the exact document explicitly approved by the user.
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.tmpdir(), 'sabero-drive-browser-check', 'node_modules', 'playwright-core'));
const documentName = 'Presentacion_Institucional_Sabero_Consulting_Actualizada.pdf';
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const appPages = browser.contexts().flatMap(context => context.pages()).filter(page => page.url().startsWith('https://agente.saberoconsulting.com'));
  console.log(JSON.stringify({event:'app-frames',pages:appPages.map(page=>page.frames().map(frame=>{try{const u=new URL(frame.url());return u.origin+u.pathname;}catch{return 'internal';}}))}));
  const page = appPages.find(page => page.frames().some(frame => frame.url().startsWith('https://docs.google.com'))) || appPages[0];
  if (!page) throw new Error('No se encontro la pestaña de SABERO.');
  if (process.argv.includes('--company-status')) {
    const companies = await page.evaluate(async () => {
      const response = await fetch('/api/v1/platform/admin/companies', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      return { status: response.status, companies: (data.items || []).map(item => ({ id: item.id, status: item.status, products: item.products })) };
    });
    console.log(JSON.stringify({ event: 'company-status', ...companies }));
    process.exit(0);
  }
  if (!process.argv.includes('--verify-only')) {
  const picker = page.frames().find(frame => frame.url().startsWith('https://docs.google.com'));
  if (!picker) throw new Error('No hay un selector de Drive abierto.');
  await picker.locator('[role="option"]:visible').filter({ hasText: documentName }).first().click();
  console.log(JSON.stringify({ event: 'document-clicked' }));
  const registration = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/google-drive/files' && response.request().method() === 'POST' && response.status() !== 401, { timeout: 60000 });
  await picker.locator('[role="button"][aria-disabled="false"]:visible').filter({ hasText: /^Select$/ }).click();
  const saved = await registration;
  console.log(JSON.stringify({ event: 'registration', status: saved.status() }));
  if (!saved.ok()) throw new Error('No se pudo registrar el documento seleccionado.');
  }
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await page.evaluate(async name => {
      const response = await fetch('/api/v1/google-drive/files', { credentials: 'include', cache: 'no-store' });
      const files = await response.json();
      const file = Array.isArray(files) ? files.find(file => file.name === name) : null;
      return { status: response.status, syncStatus: file?.sync_status, lastSynced: file?.last_synced_at };
    }, documentName);
    console.log(JSON.stringify({ event: 'sync-progress', ...result }));
    if (result.syncStatus === 'indexed') { console.log('DOCUMENT_INDEXED'); process.exit(0); }
    if (result.syncStatus === 'error') throw new Error('El documento se registro, pero el procesamiento termino en error.');
    await page.waitForTimeout(6000);
  }
  throw new Error('El documento se registro, pero aun no termino de sincronizarse.');
})().catch(error => { console.log(JSON.stringify({ event: 'error', message: error.message.split('\n')[0] })); process.exit(1); });
