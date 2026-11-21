// Interactive browser verification. Never logs passwords, cookies, OAuth codes, or tokens.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const readline = require('node:readline');
const { chromium } = require(path.join(os.tmpdir(), 'sabero-drive-browser-check', 'node_modules', 'playwright-core'));
const origin = 'https://agente.saberoconsulting.com';
const output = value => console.log(JSON.stringify(value));
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sabero-drive-session-'));
  const browser = process.env.SABERO_BROWSER_CDP ? await chromium.connectOverCDP(process.env.SABERO_BROWSER_CDP) : null;
  const context = browser ? browser.contexts()[0] : await chromium.launchPersistentContext(profile, {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });
  let page = context.pages().find(candidate => candidate.url().startsWith(origin)) || context.pages()[0] || await context.newPage();
  context.on('page', popup => output({ event: 'new-window', origin: (() => { try { return new URL(popup.url()).origin; } catch { return ''; } })() }));
  page.on('response', async response => {
    const url = new URL(response.url());
    if (url.origin !== origin || !url.pathname.startsWith('/api/v1/')) return;
    output({ event: 'api', path: url.pathname, status: response.status() });
    if (url.pathname === '/api/v1/integrations/google/picker-config' && response.ok()) {
      const data = await response.json().catch(() => ({}));
      output({ event: 'picker-config', enabled: data.enabled, scopes: data.scopes, projectMatches: Boolean(data.app_id && data.client_id?.startsWith(`${data.app_id}-`)) });
    }
    if (url.pathname === '/api/v1/google-drive/files' && response.ok() && response.request().method() === 'GET') {
      const data = await response.json().catch(() => []);
      if (Array.isArray(data)) output({ event: 'file-statuses', statuses: data.map(file => file.sync_status) });
    }
  });
  page.on('console', message => {
    if (message.text().startsWith('SABERO_OAUTH_DIAGNOSTIC ')) output({ event: 'oauth-diagnostic', detail: message.text().slice('SABERO_OAUTH_DIAGNOSTIC '.length) });
    if (/Cross-Origin-Opener-Policy|Content Security Policy|Refused to (frame|connect|load)/i.test(message.text())) {
      output({ event: 'browser-policy', message: message.text().replace(/https?:\/\/\S+/g, '[URL]') });
    }
  });
  page.on('pageerror', error => output({ event: 'javascript-error', name: error.name, message: error.message.replace(/https?:\/\/\S+/g, '[URL]') }));
  if (!page.url().startsWith(origin)) await page.goto(origin, { waitUntil: 'domcontentloaded' });
  output({ event: 'ready', instructions: 'User signs in directly in the browser. Commands: status, knowledge, select, reload, screenshot, close.' });
  const commands = readline.createInterface({ input: process.stdin });
  for await (const command of commands) {
    try {
      if (page.isClosed()) {
        page = context.pages().find(candidate => candidate.url().startsWith(origin));
        if (!page) { output({ event: 'app-tab-closed', openOrigins: context.pages().map(candidate => {try {return new URL(candidate.url()).origin;} catch {return '';}}) }); continue; }
      }
      if (command.trim() === 'status') {
        output({ event: 'status', path: new URL(page.url()).pathname, knowledgeVisible: await page.getByText('Conocimiento', { exact: true }).count(), alerts: await page.getByRole('alert').allTextContents(), frameOrigins: page.frames().map(frame => { try { return new URL(frame.url()).origin; } catch { return ''; } }) });
      } else if (command.trim() === 'api-status') {
        output({ event: 'api-status', results: await page.evaluate(async () => {
          const results = [];
          for (const route of ['/auth/me', '/integrations/google/picker-config', '/integrations/google/status']) {
            const response = await fetch(`/api/v1${route}`, { credentials: 'include', cache: 'no-store' });
            const data = await response.json();
            results.push({ route, status: response.status, enabled: data.enabled, scopes: data.scopes, connected: data.connected });
          }
          return results;
        }) });
      } else if (command.trim() === 'instrument') {
        await page.evaluate(() => {
          const oauth = window.google.accounts.oauth2;
          if (oauth.saberoInstrumented) return;
          const original = oauth.initTokenClient.bind(oauth);
          oauth.initTokenClient = config => original({ ...config,
            callback: response => { console.info('SABERO_OAUTH_DIAGNOSTIC ' + JSON.stringify({ accessTokenReceived: Boolean(response.access_token), error: response.error || null, scope: response.scope || null })); config.callback(response); },
            error_callback: error => { console.info('SABERO_OAUTH_DIAGNOSTIC ' + JSON.stringify({ type: error?.type || null })); config.error_callback?.(error); },
          });
          oauth.saberoInstrumented = true;
        });
        await page.getByRole('button', { name: 'Reintentar conexión', exact: true }).click();
        output({ event: 'instrumented' });
      } else if (command.trim() === 'google-status') {
        for (const candidate of context.pages().filter(candidate => candidate.url().startsWith('https://accounts.google.com'))) {
          const body = await candidate.locator('body').innerText();
          output({ event: 'google-window', title: await candidate.title(), signals: body.split('\n').filter(line => /error|bloquead|blocked|denegad|denied|access|acceso|verific|testing|prueba|redirect|origin|400|403/i.test(line)).map(line => line.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[cuenta]')).slice(0, 20) });
        }
      } else if (command.trim() === 'files') {
        output({ event: 'files', result: await page.evaluate(async () => {
          const response = await fetch('/api/v1/google-drive/files', { credentials: 'include', cache: 'no-store' });
          const files = await response.json();
          return { status: response.status, files: Array.isArray(files) ? files.map(file => ({ status: file.sync_status, lastSynced: file.last_synced_at })) : [] };
        }) });
      } else if (command.trim() === 'picker-token-status') {
        output({ event: 'picker-token-status', result: await page.evaluate(async () => {
          const response = await fetch('/api/v1/integrations/google/picker-token', { credentials: 'include', cache: 'no-store' });
          if (response.ok) return { status: response.status };
          const data = await response.json().catch(() => ({}));
          return { status: response.status, message: data.message };
        }) });
      } else if (command.trim() === 'check-existing-file') {
        output({ event: 'existing-file-access', result: await page.evaluate(async () => {
          const permission = await fetch('/api/v1/integrations/google/picker-token', { credentials: 'include', cache: 'no-store' });
          if (!permission.ok) return { permissionStatus: permission.status };
          const { access_token } = await permission.json();
          const filesResponse = await fetch('/api/v1/google-drive/files', { credentials: 'include', cache: 'no-store' });
          const files = await filesResponse.json();
          const results = [];
          for (const file of Array.isArray(files) ? files : []) {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.google_file_id)}?fields=mimeType,trashed&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${access_token}` } });
            const data = await response.json();
            results.push({ status: response.status, mimeType: data.mimeType, trashed: data.trashed, reason: data.error?.errors?.[0]?.reason });
          }
          return results;
        }) });
      } else if (command.trim() === 'search-report') {
        const picker = page.frames().find(frame => frame.url().startsWith('https://docs.google.com/picker'));
        if (!picker) throw new Error('No hay un selector de Drive abierto.');
        const search = picker.getByRole('textbox').first();
        await search.fill('Informe_SABERO_Consulting');
        await search.press('Enter');
        output({ event: 'report-search-started' });
      } else if (command.trim() === 'sync') {
        output({ event: 'sync', status: await page.evaluate(async () => {
          const csrf = document.cookie.split('; ').find(cookie => cookie.startsWith('sabero_csrf='))?.slice('sabero_csrf='.length);
          const response = await fetch('/api/v1/google-drive/sync', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': decodeURIComponent(csrf || '') }, body: '{}' });
          return response.status;
        }) });
      } else if (command.trim() === 'detach') {
        process.exit(0);
      } else if (command.trim() === 'knowledge') {
        await page.getByText('Conocimiento', { exact: true }).first().click();
        output({ event: 'knowledge-opened' });
      } else if (command.trim() === 'select') {
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: 'Seleccionar documentos', exact: true }).click();
        output({ event: 'select-clicked' });
      } else if (command.trim() === 'reload') {
        await page.reload({ waitUntil: 'domcontentloaded' });
        output({ event: 'reloaded' });
      } else if (command.trim() === 'screenshot') {
        const target = path.join(__dirname, 'drive-browser.png');
        await page.screenshot({ path: target });
        output({ event: 'screenshot', path: target });
      } else if (command.trim() === 'close') {
        await context.close();
        break;
      }
    } catch (error) {
      output({ event: 'command-error', message: error.message.split('\n')[0] });
    }
  }
})().catch(error => { output({ event: 'fatal', message: error.message.split('\n')[0] }); process.exitCode = 1; });
