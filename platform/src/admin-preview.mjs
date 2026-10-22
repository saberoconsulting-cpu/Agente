// Local-only preview. Starts no worker and never connects to a remote database.
import { readFile, writeFile, open, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { parse } = require(resolve(root, 'backend/node_modules/dotenv'));
const load = async path => parse(await readFile(path));
const backendPath = resolve(root, 'backend/.env');
const backend = await load(backendPath);
const runtimePath = resolve(root, 'platform/.env.runtime');
const runtime = await load(runtimePath);
for (const url of [backend.DATABASE_URL, runtime.CONTROL_DATABASE_URL, runtime.MONGODB_URI, backend.PLATFORM_API_URL]) {
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Preview requires local database and service URLs');
}
const {Pool}=require(resolve(root,'backend/node_modules/pg'));
for(const connectionString of [runtime.CONTROL_DATABASE_URL,backend.DATABASE_URL]) {
  const pool=new Pool({connectionString,ssl:false,connectionTimeoutMillis:3000,query_timeout:3000,max:1});
  try {await pool.query('SELECT 1');}
  catch {throw new Error('PostgreSQL local no responde en 55432. Inicia o reanuda Docker Desktop y comprueba sabero-local-postgres-1 antes de arrancar el backend.');}
  finally {await pool.end();}
}
const token = backend.PLATFORM_ADMIN_TOKEN || randomBytes(32).toString('hex');
async function update(path, values) {
  let source = await readFile(path, 'utf8');
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${JSON.stringify(value)}`;
    const match = new RegExp(`^${key}=.*$`, 'm');
    source = match.test(source) ? source.replace(match, () => line) : `${source.trimEnd()}\n${line}\n`;
  }
  await writeFile(path, source);
}
await update(backendPath, { PUBLIC_ACCESS_REQUESTS_ENABLED: 'true', PLATFORM_ADMIN_TOKEN: token, PLATFORM_ADMIN_EMAILS: backend.PLATFORM_ADMIN_EMAILS || backend.ADMIN_EMAIL, PLATFORM_ADMIN_COMPANY_ID: 'sabero' });
await update(runtimePath, { PLATFORM_ADMIN_TOKEN: token, PLATFORM_ADMIN_COMPANY_ID: 'sabero' });
const directory = resolve(root, 'platform/generated/local');
await mkdir(directory, { recursive: true });
let processes = {};
try { processes = JSON.parse(await readFile(resolve(directory, 'admin-preview.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const [name, cwd, args] of [
  ['platform', resolve(root, 'platform'), ['--env-file=.env.runtime', 'src/server.mjs']],
  ['backend', resolve(root, 'backend'), ['dist/src/main.js']],
  ['frontend', resolve(root, 'frontend'), [resolve(root, 'platform/src/next-local.cjs'), '5173']],
]) {
  const old = processes[name];
  if (old) { try { process.kill(old, 0); console.log(`${name} already started by preview`); continue; } catch {} }
  const port={platform:3010,backend:3001,frontend:5173}[name];
  const occupied=await new Promise(done=>{const socket=createConnection({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();done(true);});socket.once('error',()=>{socket.destroy();done(false);});});
  if(occupied) {if(name==='frontend'){console.log('Existing frontend on 5173 preserved.');continue;}throw new Error(`${name}: local port already in use`);}
  const log = await open(resolve(directory, `admin-preview-${name}.log`), 'a');
  try {
    const child = spawn(process.execPath, args, { cwd, detached: true, windowsHide: true, env: { ...process.env, NODE_ENV: 'development' }, stdio: ['ignore', log.fd, log.fd] });
    await new Promise((done, reject) => { child.once('spawn', done); child.once('error', reject); });
    processes[name] = child.pid;
    child.unref();
  } finally { await log.close(); }
}
await writeFile(resolve(directory, 'admin-preview.json'), JSON.stringify(processes));
console.log('Local preview: http://127.0.0.1:5173. Use backend/.env ADMIN_EMAIL and ADMIN_PASSWORD.');
