import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdir, readFile, writeFile, access, open } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { Registry, controlSchema } from './registry.mjs';

const folder = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = resolve(folder, '../..');
const agent = resolve(workspace, 'AGENT-AI/backend');
const agentWeb = resolve(workspace, 'AGENT-AI/frontend');
const crm = resolve(workspace, 'crm_inmobiliario/backend');
const crmWeb = resolve(workspace, 'crm_inmobiliario/frontend');
const local = resolve(folder, 'generated/local');
const require = createRequire(import.meta.url);
const dotenv = require(resolve(agent, 'node_modules/dotenv'));
const processesFile = join(local, 'processes.json');
const token = () => randomBytes(32).toString('hex');
const urls = { agent: 'http://127.0.0.1:5173', crm: 'http://127.0.0.1:5174', platform: 'http://127.0.0.1:3010' };

async function readEnv(path) {
  try { return dotenv.parse(await readFile(path)); } catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}
async function envFile(path, values, backup = false) {
  if (backup) {
    try {
      const original = await readFile(path);
      try { await access(`${path}.before-platform-local`); }
      catch { await writeFile(`${path}.before-platform-local`, original, { mode: 0o600 }); }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(path, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join('\n') + '\n', { mode: 0o600 });
}
async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function command(executable, args, cwd, env = {}, logName = 'setup') {
  const log = await open(join(local, `${logName}.log`), 'a');
  try {
    await new Promise((done, reject) => {
      const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? done() : reject(new Error(`${logName} failed (${code}); see generated/local/${logName}.log`)));
    });
  } finally { await log.close(); }
}
const runNode = (args, cwd, env, name) => command(process.execPath, args, cwd, env, name);
const compose = args => command('docker', ['compose', '--env-file', join(local, 'infrastructure.env'), '-f', join(folder, 'compose.local.yml'), ...args], folder, {}, 'infrastructure');
async function waitFor(url, name, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return; } catch {}
    await new Promise(done => setTimeout(done, 1000));
  }
  throw new Error(`${name} did not become ready; see generated/local/${name}.log`);
}
async function launch(name, args, cwd, env = {}) {
  const processes = await json(processesFile, {});
  const current = processes[name];
  if (current) {
    try { process.kill(current.pid, 0); return; } catch {}
  }
  const ports = { platform: 3010, 'agent-api': 3001, 'crm-api': 3002, 'agent-web': 5173, 'crm-web': 5174 };
  if (ports[name]) {
    const occupied = await new Promise(done => {
      const socket = createConnection({ host: '127.0.0.1', port: ports[name] });
      socket.once('connect', () => { socket.destroy(); done(true); });
      socket.once('error', () => { socket.destroy(); done(false); });
      socket.setTimeout(2000, () => { socket.destroy(); done(true); });
    });
    if (occupied) throw new Error(`${name}: port ${ports[name]} is occupied by another server; stop that server before local startup`);
  }
  const log = await open(join(local, `${name}.log`), 'a');
  try {
    const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, detached: true,
      windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
    await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject); });
    processes[name] = { pid: child.pid, startedAt: new Date().toISOString(), cwd };
    await writeFile(processesFile, JSON.stringify(processes, null, 2));
    child.unref();
  } finally { await log.close(); }
}
async function stopProcesses() {
  const processes = await json(processesFile, {});
  for (const [name, entry] of Object.entries(processes).reverse()) {
    if (!Number.isInteger(entry.pid) || ![folder, agent, agentWeb, crm, crmWeb].includes(entry.cwd)) throw new Error('Invalid local process record');
    if (process.platform === 'win32') {
      // Verify process name and creation time before stopping a recorded process tree.
      const verify = `$p=Get-Process -Id ${entry.pid} -ErrorAction SilentlyContinue; if ($p -and $p.ProcessName -eq 'node' -and [Math]::Abs(($p.StartTime.ToUniversalTime()-[DateTime]::Parse('${entry.startedAt}').ToUniversalTime()).TotalSeconds) -lt 15) { exit 0 }; exit 3`;
      try {
        await command('powershell.exe', ['-NoProfile', '-Command', verify], folder, {}, 'stop');
        await command('taskkill', ['/PID', String(entry.pid), '/T', '/F'], folder, {}, 'stop');
      } catch { console.log(`${name}: already stopped or PID no longer belongs to this launch`); }
    } else { try { process.kill(-entry.pid, 'SIGTERM'); } catch {} }
  }
  await writeFile(processesFile, '{}');
}

async function check() {
  const env = await readEnv(join(agent, '.env'));
  for (const [name, url] of [['agent-api', 'http://127.0.0.1:3001/api/v1/health'], ['platform', `${urls.platform}/health`], ['agent-web', urls.agent], ['crm-web', `${urls.crm}/login`]]) {
    await waitFor(url, name); console.log(`${name}: OK`);
  }
  const login = await fetch(`${urls.agent}/api/v1/auth/login`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
  if (!login.ok) throw new Error(`Agent login failed (${login.status})`);
  const cookies = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const headers = { cookie: cookies };
  for (const path of ['/dashboard/summary', '/platform/company', '/conversations', '/leads']) {
    const response = await fetch(`${urls.agent}/api/v1` + path, { headers });
    if (!response.ok) throw new Error(`Agent ${path} failed (${response.status})`);
  }
  console.log('agent-login-and-data: OK');
  const crmLogin = await fetch(`${urls.crm}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD }) });
  if (!crmLogin.ok) throw new Error(`CRM login failed (${crmLogin.status})`);
  const session = await crmLogin.json();
  const clients = await fetch(`${urls.crm}/api/clients`, { headers: { Authorization: `Bearer ${session.token}` } });
  if (!clients.ok) throw new Error(`CRM clients failed (${clients.status})`);
  console.log('crm-login-and-data: OK');
  const central = await fetch(`${urls.platform}/v1/company`, { headers: { Authorization: `Bearer ${env.PLATFORM_SERVICE_TOKEN}`, 'X-Company-Id': env.COMPANY_ID } });
  const company = await central.json();
  if (!central.ok || !company.products.includes('agent') || !company.products.includes('crm')) throw new Error('Shared company is not active for both products');
  console.log('shared-company-agent-crm: OK');
  const processes = await json(processesFile, {});
  if (!processes['agent-worker']) throw new Error('Agent worker is not registered');
  try { process.kill(processes['agent-worker'].pid, 0); } catch { throw new Error('Agent worker is not running'); }
  console.log('agent-worker: OK');
}

async function up() {
  const statePath = join(local, 'secrets.json');
  let secrets = await json(statePath, null);
  if (!secrets) {
    secrets = { postgres: token(), mongo: token(), runtime: token(), encryption: token() };
    await writeFile(statePath, JSON.stringify(secrets), { mode: 0o600 });
  }
  if (!secrets.platformAdmin) {
    secrets.platformAdmin = token();
    await writeFile(statePath, JSON.stringify(secrets), { mode: 0o600 });
  }
  await envFile(join(local, 'infrastructure.env'), { POSTGRES_PASSWORD: secrets.postgres, MONGO_PASSWORD: secrets.mongo });
  console.log('Starting local PostgreSQL/pgvector and MongoDB (data volumes are preserved)...');
  await compose(['up', '-d', '--wait']);
  const base = `postgresql://postgres:${secrets.postgres}@127.0.0.1:55432`;
  const platformEnv = { PLATFORM_ADMIN_COMPANY_ID: 'sabero', PLATFORM_ADMIN_TOKEN: secrets.platformAdmin, CONTROL_DATABASE_URL: `${base}/sabero_control`, PROVISION_DATABASE_URL: `${base}/postgres`,
    MONGODB_URI: `mongodb://platform:${secrets.mongo}@127.0.0.1:57017/?authSource=admin`, PLATFORM_ENCRYPTION_KEY: secrets.encryption,
    TENANT_POSTGRES_HOST: '127.0.0.1', TENANT_POSTGRES_PORT: '55432', TENANT_DOMAIN_SUFFIX: 'localhost' };
  await envFile(join(folder, '.env'), platformEnv, true);
  const registry = new Registry(platformEnv);
  try {
    await registry.control.query(controlSchema);
    const role = await registry.control.query("SELECT 1 FROM pg_roles WHERE rolname='sabero_platform_runtime'");
    if (!role.rowCount) await registry.control.query(`CREATE ROLE sabero_platform_runtime LOGIN PASSWORD '${secrets.runtime}' NOSUPERUSER NOCREATEDB NOCREATEROLE`);
    await registry.control.query(`GRANT CONNECT ON DATABASE sabero_control TO sabero_platform_runtime;
      GRANT USAGE ON SCHEMA public TO sabero_platform_runtime;
      GRANT SELECT ON platform_companies,platform_products,platform_service_credentials TO sabero_platform_runtime`);
    await registry.control.query('GRANT SELECT,INSERT,UPDATE ON platform_access_requests TO sabero_platform_runtime');
    await registry.control.query('GRANT UPDATE(status,deleted_at) ON platform_companies TO sabero_platform_runtime');
    await registry.control.query('GRANT SELECT,INSERT,UPDATE ON platform_access_notifications TO sabero_platform_runtime');
    const priorRuntime=await readEnv(join(folder,'.env.runtime'));
    const notificationEnv=Object.fromEntries(['ACCESS_NOTIFICATIONS_ENABLED','BREVO_API_KEY','BREVO_SENDER_EMAIL','BREVO_SENDER_NAME','BREVO_REPLY_TO'].filter(key=>priorRuntime[key]).map(key=>[key,priorRuntime[key]]));
    const runtime = { ...platformEnv, ...notificationEnv, CONTROL_DATABASE_URL: `postgresql://sabero_platform_runtime:${secrets.runtime}@127.0.0.1:55432/sabero_control`,
      HOST: '127.0.0.1', PORT: '3010' };
    delete runtime.PROVISION_DATABASE_URL;
    await envFile(join(folder, '.env.runtime'), runtime, true);
    const exists = await registry.control.query("SELECT status FROM platform_companies WHERE id='sabero'");
    if (!exists.rowCount) await runNode(['src/admin.mjs', 'create', 'sabero', 'SABERO Desarrollo', 'real-estate'], folder, platformEnv, 'provision');
    else if (exists.rows[0].status !== 'active') throw new Error('Local company provisioning needs recovery; see provision.log');
    console.log('Applying the agent and CRM migrations to the local enterprise database...');
    await runNode(['src/admin.mjs', 'activate', 'sabero', 'agent,crm'], folder, platformEnv, 'migrations');
    const originalAgent = await readEnv(join(agent, '.env'));
    const originalCrm = await readEnv(join(crm, '.env'));
    const agentEnv = { ...originalAgent, ...await readEnv(join(folder, 'generated/sabero/agent.env')), NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3001',
      PLATFORM_API_URL: urls.platform, FRONTEND_URL: 'http://127.0.0.1:5173,http://localhost:5173',
      PUBLIC_WEBHOOK_BASE_URL: 'http://localhost:3001', APP_BASE_URL: 'http://localhost:3001',
      GOOGLE_REDIRECT_URI: 'http://localhost:3001/integrations/google/callback', ADMIN_COMPANY_ID: 'sabero', WEBHOOK_SIGNATURE_REQUIRED: 'true',
      PLATFORM_ADMIN_TOKEN: secrets.platformAdmin, PLATFORM_ADMIN_EMAILS: originalAgent.PLATFORM_ADMIN_EMAILS || originalAgent.ADMIN_EMAIL,
      PLATFORM_ADMIN_COMPANY_ID: 'sabero', PUBLIC_ACCESS_REQUESTS_ENABLED: 'true' };
    if (!agentEnv.ADMIN_EMAIL || !agentEnv.ADMIN_PASSWORD) throw new Error('Configure ADMIN_EMAIL and ADMIN_PASSWORD in the agent .env before local startup');
    const crmEnv = { ...originalCrm, ...await readEnv(join(folder, 'generated/sabero/crm.env')), NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3002',
      PLATFORM_API_URL: urls.platform, FRONTEND_URL: 'http://127.0.0.1:5174,http://localhost:5174', ADMIN_EMAIL: agentEnv.ADMIN_EMAIL,
      ADMIN_PASSWORD: agentEnv.ADMIN_PASSWORD, COMPANY_NAME: 'SABERO Desarrollo' };
    await envFile(join(agent, '.env'), agentEnv, true);
    await envFile(join(crm, '.env'), crmEnv, true);
    await envFile(join(agentWeb, '.env.local'), { ...await readEnv(join(agentWeb, '.env.local')), NEXT_PUBLIC_API_BASE: '', NEXT_PUBLIC_API_PROXY_TARGET: 'http://127.0.0.1:3001' }, true);
    await envFile(join(crmWeb, '.env.local'), { ...await readEnv(join(crmWeb, '.env.local')), NEXT_PUBLIC_API: 'http://127.0.0.1:3002' }, true);
    console.log('Building both backends...');
    await Promise.all([
      runNode(['node_modules/@nestjs/cli/bin/nest.js', 'build'], agent, {}, 'agent-build'),
      runNode(['node_modules/@nestjs/cli/bin/nest.js', 'build'], crm, {}, 'crm-build'),
    ]);
    await launch('platform', ['src/server.mjs'], folder, runtime);
    await waitFor(`${urls.platform}/health`, 'platform');
    await runNode(['dist/scripts/create-admin.js'], agent, agentEnv, 'agent-owner');
    await runNode(['dist/platform/create-owner.js'], crm, { ...crmEnv, LOCAL_RESET_OWNER_PASSWORD: 'true' }, 'crm-owner');
    await launch('agent-api', ['dist/src/main.js'], agent, agentEnv);
    await launch('crm-api', ['dist/main.js'], crm, crmEnv);
    await waitFor('http://127.0.0.1:3001/api/v1/health', 'agent-api');
    await launch('agent-worker', ['dist/src/worker.js'], agent, agentEnv);
    await launch('agent-web', [join(folder, 'src/next-local.cjs'), '5173'], agentWeb, { NODE_ENV: 'development' });
    await launch('crm-web', [join(folder, 'src/next-local.cjs'), '5174'], crmWeb, { NODE_ENV: 'development' });
    await check();
    console.log(`Agent: ${urls.agent}\nCRM: ${urls.crm}\nUse the ADMIN_EMAIL/ADMIN_PASSWORD configured in backend/.env. Remote databases were not changed.`);
  } finally { await registry.close(); }
}

await mkdir(local, { recursive: true });
const action = process.argv[2] || 'up';
try {
  if (action === 'up') await up();
  else if (action === 'check') await check();
  else if (action === 'whatsapp') {
    await runNode(['dist/scripts/connect-local-whatsapp.js'], agent, await readEnv(join(agent, '.env')), 'whatsapp-connect');
    console.log('WhatsApp token verified and stored encrypted. An HTTPS callback is still required for public webhooks.');
  }
  else if (action === 'down') { await stopProcesses(); await compose(['stop']); console.log('Local services stopped; database volumes preserved'); }
  else if (action === 'restart') { await stopProcesses(); await up(); }
  else throw new Error('Use up, check, whatsapp, down or restart');
} catch (error) {
  console.error(error.message.replace(/(?:postgres(?:ql)?|mongodb):\/\/\S+/g, '[connection redacted]'));
  process.exitCode = 1;
}
