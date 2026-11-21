// Read-only account check and a broader search inside the existing Picker.
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.tmpdir(), 'sabero-drive-browser-check', 'node_modules', 'playwright-core'));
(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('https://agente.saberoconsulting.com'));
  if (!page) throw new Error('No se encontro la pestaña de SABERO.');
  const account = await page.evaluate(async () => {
    const permission = await fetch('/api/v1/integrations/google/picker-token', { credentials: 'include', cache: 'no-store' });
    if (!permission.ok) return { status: permission.status };
    const { access_token } = await permission.json();
    const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: `Bearer ${access_token}` } });
    const data = await response.json();
    return { status: response.status, connectedAccount: data.user?.emailAddress };
  });
  console.log(JSON.stringify({ event: 'connected-account', ...account }));
  const picker = page.frames().find(frame => frame.url().startsWith('https://docs.google.com/picker'));
  if (!picker) throw new Error('No hay un selector de Drive abierto.');
  console.log(JSON.stringify({event:'layout',viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight})),frames:await page.locator('iframe').evaluateAll(nodes=>nodes.map(node=>({title:node.title,width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility}))),options:await picker.locator('[role="option"]').filter({hasText:'Presentacion_Institucional_Sabero_Consulting_Actualizada.pdf'}).evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height,selected:node.getAttribute('aria-selected'),display:getComputedStyle(node).display}))),buttons:await picker.locator('[role="button"]').evaluateAll(nodes=>nodes.map(node=>({text:node.textContent,disabled:node.getAttribute('aria-disabled')})))}));
  await page.screenshot({path:path.join(__dirname,'current-selection-browser.png')});
  const search = picker.getByRole('textbox').first();
  await search.fill('SABERO');
  await search.press('Enter');
  await page.waitForTimeout(2500);
  console.log(JSON.stringify({ event: 'broader-search', query: 'SABERO', visibleResults: (await picker.locator('body').innerText()).slice(0, 2500) }));
  process.exit(0);
})().catch(error => { console.log(JSON.stringify({ event: 'error', message: error.message.split('\n')[0] })); process.exit(1); });
