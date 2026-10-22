import pg from 'pg';
import { MongoClient } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Registry, contactSchema, controlSchema } from './registry.mjs';
import { tenantId, products, encrypt, decrypt, serviceToken, tokenHash } from './domain.mjs';
import { initializeMessages } from './messages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const agent = resolve(root, 'AGENT-AI/backend');
const crm = resolve(root, 'crm_inmobiliario/backend');
const generated = resolve(root, 'AGENT-AI/platform/generated');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";

async function run(script, args, cwd, env) {
  await new Promise((done, reject) => {
    // No shell; connections and secrets are carried in environment, not command arguments.
    const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'ignore'] });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? done() : reject(new Error(`Migration command failed (${code}); inspect migrations on a development database`)));
  });
}

function connection(base, database, username, password) {
  const url = new URL(base);
  url.pathname = '/' + database;
  url.username = username;
  url.password = password;
  url.searchParams.delete('schema');
  return url.toString();
}

export async function migrateProduct(product, url, company) {
  const shared = new pg.Pool({ connectionString: url, max: 1 });
  let freshAgent = false;
  try {
    await shared.query(contactSchema);
    if (product === 'agent') freshAgent = !(await shared.query("SELECT to_regclass('agent.companies') AS name")).rows[0].name;
  } finally { await shared.end(); }
  if (product === 'agent') {
    const prisma = new URL(url);
    prisma.searchParams.set('schema', 'agent');
    await run(resolve(agent, 'node_modules/prisma/build/index.js'), ['migrate', 'deploy'], agent,
      { DATABASE_URL: prisma.toString(), DIRECT_DATABASE_URL: prisma.toString() });
    const pool = new pg.Pool({ connectionString: url, max: 1 });
    try {
      await pool.query('INSERT INTO agent.companies(id,name) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET name=excluded.name', [company.id, company.name]);
      await pool.query(`INSERT INTO agent.company_agent_settings(company_id,agent_name,system_rules) VALUES($1,$2,$3) ON CONFLICT(company_id) DO NOTHING`,
        [company.id, `Asistente virtual de ${company.name}`, 'Identificarse como asistente virtual. No inventar precios, descuentos, plazos ni capacidades. Usar exclusivamente el conocimiento autorizado de esta empresa.']);
      // Remove only the baseline demonstration records from a newly provisioned company.
      if (freshAgent && company.id !== 'sabero') {
        await pool.query("DELETE FROM agent.negotiation_policies WHERE company_id='sabero'");
        await pool.query("DELETE FROM agent.company_agent_settings WHERE company_id='sabero'");
        await pool.query("DELETE FROM agent.companies WHERE id='sabero'");
      }
    } finally { await pool.end(); }
  } else {
    await run(resolve(crm, 'node_modules/ts-node/dist/bin.js'), ['src/platform/migrate.ts'], crm,
      { DATABASE_URL: url, DB_SSL: 'false', NODE_ENV: 'development', PLATFORM_MANAGED: 'true', COMPANY_ID: company.id });
  }
  await installContactSync(product, url);
}

export async function installContactSync(product, url) {
  products([product]);
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const table = product === 'agent' ? 'agent.leads' : 'public.clients';
    const columns = product === 'agent' ? 'name, whatsapp_number' : 'full_name, phone, email';
    await pool.query(`CREATE OR REPLACE FUNCTION platform.enqueue_${product}_contact() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO platform.contact_outbox(product,external_id) VALUES('${product}',NEW.id::text)
      ON CONFLICT(product,external_id) DO UPDATE SET version=gen_random_uuid(); RETURN NEW; END $$`);
    await pool.query(`DROP TRIGGER IF EXISTS platform_contact_changed ON ${table}`);
    await pool.query(`CREATE TRIGGER platform_contact_changed AFTER INSERT OR UPDATE OF ${columns} ON ${table}
      FOR EACH ROW EXECUTE FUNCTION platform.enqueue_${product}_contact()`);
    await pool.query(`INSERT INTO platform.contact_outbox(product,external_id) SELECT $1,id::text FROM ${table} ON CONFLICT DO NOTHING`, [product]);
  } finally { await pool.end(); }
}

export async function exportConfig(registry, company, outputDirectory = generated) {
  const suffix = process.env.TENANT_DOMAIN_SUFFIX || 'example.com';
  if (!/^[a-z0-9.-]{1,253}$/i.test(suffix)) throw new Error('Invalid TENANT_DOMAIN_SUFFIX');
  const folder = resolve(outputDirectory, company.id);
  await mkdir(folder, { recursive: true });
  const privateUrl = decrypt(company.encrypted_connection, registry.env.PLATFORM_ENCRYPTION_KEY);
  const dockerUrl = new URL(privateUrl);
  dockerUrl.hostname = process.env.TENANT_POSTGRES_HOST || dockerUrl.hostname;
  dockerUrl.port = process.env.TENANT_POSTGRES_PORT || dockerUrl.port;
  const { rows: enabled } = await registry.control.query("SELECT product FROM platform_products WHERE company_id=$1 AND status='active'", [company.id]);
  const services = {};
  const ingress = [];
  for (const { product } of enabled) {
    // Preserve deployed credentials when exporting again (for example after adding CRM).
    const path = resolve(folder, `${product}.env`);
    let old = '';
    try { old = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const values = Object.fromEntries(old.split('\n').filter(line => line.includes('=') && !line.startsWith('#')).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
    const token = values.PLATFORM_SERVICE_TOKEN || serviceToken();
    await registry.control.query(`INSERT INTO platform_service_credentials(company_id,product,token_hash) VALUES($1,$2,$3)
      ON CONFLICT(company_id,product) DO UPDATE SET token_hash=excluded.token_hash`, [company.id, product, tokenHash(token)]);
    Object.assign(values, { NODE_ENV: 'production', COMPANY_ID: company.id, COMPANY_NAME: company.name, PLATFORM_MANAGED: 'true',
      PLATFORM_API_URL: 'http://platform:3010', PLATFORM_SERVICE_TOKEN: token, PORT: '3001',
      DATABASE_URL: dockerUrl.toString() });
    values.FRONTEND_URL ||= `https://${company.id}-${product}.${suffix}`;
    if (product === 'agent') {
      const prismaUrl = new URL(dockerUrl); prismaUrl.searchParams.set('schema', 'agent');
      prismaUrl.searchParams.set('connection_limit', '5');
      Object.assign(values, { DATABASE_URL: prismaUrl.toString(), DIRECT_DATABASE_URL: prismaUrl.toString(), DATABASE_SCHEMA: 'agent', DATABASE_SSL: 'false',
        AUTH_SECRET: values.AUTH_SECRET || serviceToken(), OAUTH_TOKEN_ENCRYPTION_KEY: values.OAUTH_TOKEN_ENCRYPTION_KEY || serviceToken(),
        MESSAGING_STORE: 'mongo' });
      values.PUBLIC_WEBHOOK_BASE_URL ||= values.FRONTEND_URL;
      values.APP_BASE_URL ||= values.FRONTEND_URL;
      values.GOOGLE_REDIRECT_URI ||= `${values.FRONTEND_URL}/integrations/google/callback`;
    } else { values.JWT_SECRET ||= serviceToken(); values.DB_SSL = 'false'; }
    await writeFile(path, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
    const name = `${company.id}-${product}`;
    services[name] = { build: { context: product === 'agent' ? '../../../backend' : '../../../../crm_inmobiliario/backend' },
      env_file: [`${product}.env`], restart: 'unless-stopped', expose: ['3001'],
      networks: ['sabero'], mem_limit: '512m', ...(product === 'crm' ? { volumes: [`${company.id}-uploads:/app/uploads`] } : {}) };
    if (product === 'agent') services[`${name}-worker`] = { ...services[name], command: ['npm', 'run', 'start:worker'] };
    services[`${name}-web`] = { build: { context: product === 'agent' ? '../../../frontend' : '../../../../crm_inmobiliario/frontend' },
      restart: 'unless-stopped', expose: ['3000'], networks: ['sabero'], mem_limit: '512m' };
    const domain = `${company.id}-${product}.${suffix}`;
    ingress.push(`server {
  listen 80;
  server_name ${domain};
  client_max_body_size 25m;
  location /api/ { proxy_pass http://${name}:3001; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; }
  location /integrations/ { proxy_pass http://${name}:3001; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
  location /socket.io/ { proxy_pass http://${name}:3001; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Origin $http_origin; }
  location /uploads/ { proxy_pass http://${name}:3001; }
  location / { proxy_pass http://${name}-web:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}`);
  }
  const document = { name: `sabero-${company.id}`, services, networks: { sabero: { external: true } },
    ...(enabled.some(row => row.product === 'crm') ? { volumes: { [`${company.id}-uploads`]: {} } } : {}) };
  await writeFile(resolve(folder, 'compose.json'), JSON.stringify(document, null, 2));
  await writeFile(resolve(folder, 'nginx.conf'), ingress.join('\n\n') + '\n');
}

async function main() {
  const [command, id, value, sector = 'general'] = process.argv.slice(2);
  const registry = new Registry();
  let admin;
  let mongo;
  try {
    if (command === 'init') {
      await registry.control.query(controlSchema);
      console.log('Control schema ready'); return;
    }
    tenantId(id);
    if (command === 'create') {
      if (!value || !/^[^\r\n#$=]{1,200}$/.test(value) || !/^[a-z-]{2,40}$/.test(sector)) throw new Error('Company name must be a single line without #, $, or =; valid sector is required');
      admin = new pg.Pool({ connectionString: process.env.PROVISION_DATABASE_URL, max: 1 });
      const db = 'tenant_' + randomBytes(12).toString('hex');
      const role = db;
      const password = serviceToken();
      const url = connection(process.env.PROVISION_DATABASE_URL, db, role, password);
      await registry.control.query(`INSERT INTO platform_companies(id,name,sector,database_name,encrypted_connection,mongo_database)
        VALUES($1,$2,$3,$4,$5,$4)`, [id, value, sector, db, encrypt(url, process.env.PLATFORM_ENCRYPTION_KEY)]);
      try {
        await admin.query(`CREATE ROLE ${quote(role)} LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
        await admin.query(`CREATE DATABASE ${quote(db)} OWNER ${quote(role)}`);
        await admin.query(`REVOKE CONNECT ON DATABASE ${quote(db)} FROM PUBLIC`);
        const tenantAdmin = new pg.Pool({ connectionString: connection(process.env.PROVISION_DATABASE_URL, db, new URL(process.env.PROVISION_DATABASE_URL).username, new URL(process.env.PROVISION_DATABASE_URL).password), max: 1 });
        try {
          await tenantAdmin.query(`CREATE SCHEMA agent AUTHORIZATION ${quote(role)}`);
          await tenantAdmin.query('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public; CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA agent');
        } finally { await tenantAdmin.end(); }
        const tenant = new pg.Pool({ connectionString: url, max: 1 });
        try { await tenant.query(contactSchema); } finally { await tenant.end(); }
        mongo = await new MongoClient(process.env.MONGODB_URI).connect();
        await initializeMessages(mongo.db(db));
        await registry.control.query("UPDATE platform_companies SET status='active' WHERE id=$1", [id]);
      } catch (error) {
        // Preserve database for inspection; never delete partially provisioned customer data.
        await registry.control.query("UPDATE platform_companies SET status='failed' WHERE id=$1", [id]);
        throw error;
      }
      console.log(`Company ${id} created; activate its products next`); return;
    }
    const { rows: [company] } = await registry.control.query('SELECT * FROM platform_companies WHERE id=$1', [id]);
    if (!company) throw new Error('Company not found');
    if (command === 'activate') {
      if (company.status !== 'active') throw new Error('Company is not active');
      for (const product of products(value?.split(','))) {
        if (product === 'crm' && company.sector !== 'real-estate') throw new Error('CRM currently requires sector real-estate');
        await registry.control.query("INSERT INTO platform_products(company_id,product) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, product]);
        await migrateProduct(product, decrypt(company.encrypted_connection, process.env.PLATFORM_ENCRYPTION_KEY), company);
        await registry.control.query("UPDATE platform_products SET status='active',updated_at=now() WHERE company_id=$1 AND product=$2", [id, product]);
      }
      await exportConfig(registry, company);
      console.log(`Products prepared for ${id}; configuration written to generated/${id}`); return;
    }
    if (command === 'export') { await exportConfig(registry, company); console.log(`Configuration exported for ${id}`); return; }
    if (command === 'suspend' || command === 'resume') {
      if (command === 'resume' && company.status !== 'suspended') throw new Error('Only suspended companies can be resumed');
      await registry.control.query('UPDATE platform_companies SET status=$2 WHERE id=$1', [id, command === 'suspend' ? 'suspended' : 'active']);
      console.log(`Company ${id}: ${command}`); return;
    }
    throw new Error('Commands: init | create ID NAME SECTOR | activate ID agent,crm | export ID | suspend ID | resume ID');
  } finally { await admin?.end(); await mongo?.close(); await registry.close(); }
}

if (process.argv[1]?.endsWith('admin.mjs')) main().catch(error => { console.error('Administration failed:', error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')); process.exitCode = 1; });
