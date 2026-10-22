import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { parse } = require(resolve(root, 'backend/node_modules/dotenv'));
const env = parse(await readFile(resolve(root, 'backend/.env')));
if (!['127.0.0.1', 'localhost'].includes(new URL(env.DATABASE_URL).hostname)) throw new Error('Local database required');
const base = 'http://127.0.0.1:3001/api/v1';
const denied = await fetch(`${base}/platform/admin/companies`);
if (denied.status !== 401) throw new Error('Anonymous access was not denied');
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
if (!login.ok) throw new Error(`Local login failed (${login.status})`);
const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
if (process.argv.includes('--ai')) {
  const before = await (await fetch(`${base}/dashboard/usage`, { headers: { cookie } })).json();
  const csrf = decodeURIComponent(cookie.split('; ').find(value => value.startsWith('sabero_csrf=')).slice('sabero_csrf='.length));
  const response = await fetch(`${base}/sales-agent/test-message`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ message: 'Hola, preséntate en una frase breve y pregunta qué negocio tengo.' }) });
  if (!response.ok) throw new Error(`AI test failed (${response.status})`);
  const answer = await response.json();
  const after = await (await fetch(`${base}/dashboard/usage`, { headers: { cookie } })).json();
  if (!answer.answer || after.requests !== before.requests + 1 || Number(after.total_tokens) <= Number(before.total_tokens)) throw new Error('AI response or usage not recorded');
  console.log(`Live AI test OK: 1 completed call, ${Number(after.total_tokens) - Number(before.total_tokens)} tokens recorded. No WhatsApp message sent.`);
}
for (const path of ['/platform/capabilities', '/platform/admin/companies', '/dashboard/summary', '/dashboard/usage', '/leads?limit=200']) {
  const response = await fetch(`${base}${path}`, { headers: { cookie } });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const data = await response.json();
  if (path.includes('capabilities') && !data.platform_admin) throw new Error('Local administrator not configured');
  if (path.includes('admin/companies') && (!Array.isArray(data.items) || data.items.some(item => 'encrypted_connection' in item))) throw new Error('Invalid company overview');
  console.log(`${path}: OK`);
}
const page = await fetch('http://127.0.0.1:5173');
if (!page.ok) throw new Error(`Local frontend: ${page.status}`);
console.log('Anonymous isolation, authenticated company overview, contacts, consumption and frontend: OK');
