import pg from 'pg';
import { MongoClient } from 'mongodb';
import { Registry } from './registry.mjs';
import { createTenant, activateTenantProducts } from './provision.mjs';
import { ensureOwnerUser } from './access-requests.mjs';
import { queueNotification } from './access-notifications.mjs';

const POLL_MS = Number(process.env.PROVISION_POLL_MS || 15000);
const sanitize = error => String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]').slice(0, 500);

function slugBase(name) {
  const slug = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 44).replace(/-+$/g, '');
  const base = /^[a-z]/.test(slug) ? slug : 'empresa-' + slug;
  return (base || 'empresa').slice(0, 44);
}

async function uniqueCompanyId(control, name) {
  const base = slugBase(name);
  for (let index = 0; index < 100; index++) {
    const id = index ? `${base}-${index + 1}` : base;
    if (id.length > 48) break;
    const { rowCount } = await control.query('SELECT 1 FROM platform_companies WHERE id=$1', [id]);
    if (!rowCount) return id;
  }
  throw new Error('Could not derive a unique company ID');
}

async function failJob(control, requestId, error) {
  await control.query("UPDATE platform_access_provisioning SET status='failed',error=$2,updated_at=now() WHERE request_id=$1", [requestId, sanitize(error)]);
}

async function processJob(ctx, job) {
  const { control, registry, admin, mongo } = ctx;
  const request = (await control.query('SELECT * FROM platform_access_requests WHERE id=$1 AND deleted_at IS NULL', [job.request_id])).rows[0];
  if (!request || request.status !== 'approved') {
    await control.query("UPDATE platform_access_provisioning SET status='done',updated_at=now() WHERE request_id=$1", [job.request_id]);
    return;
  }
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(request.password_hash || '')) throw new Error('Registration password missing; reject and ask the company to register again');
  let companyId = job.company_id;
  if (!companyId) {
    companyId = await uniqueCompanyId(control, request.business_name);
    await control.query('UPDATE platform_access_provisioning SET company_id=$2,updated_at=now() WHERE request_id=$1', [job.request_id, companyId]);
  }
  const { rows: [existing] } = await control.query('SELECT * FROM platform_companies WHERE id=$1', [companyId]);
  if (!existing) {
    await createTenant({ id: companyId, name: request.business_name, sector: 'general' }, { control, admin, mongo });
  } else if (existing.status !== 'active') {
    throw new Error(`Company ${companyId} exists with status '${existing.status}'; review it manually`);
  }
  await activateTenantProducts(registry, companyId, ['agent']);
  const { rows: [company] } = await control.query('SELECT * FROM platform_companies WHERE id=$1', [companyId]);
  await ensureOwnerUser(await registry.database(company), request, companyId);
  const client = await control.connect();
  try {
    await client.query('BEGIN');
    const locked = (await client.query('SELECT status FROM platform_access_requests WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [request.id])).rows[0];
    if (locked?.status !== 'approved') {
      await client.query('ROLLBACK');
      await control.query("UPDATE platform_access_provisioning SET status='done',updated_at=now() WHERE request_id=$1", [job.request_id]);
      return;
    }
    await client.query(`UPDATE platform_access_requests SET status='active',company_id=$2,activated_by='auto-provisioner',activated_at=now(),updated_at=now() WHERE id=$1`, [request.id, companyId]);
    const result = (await client.query('SELECT * FROM platform_access_requests WHERE id=$1', [request.id])).rows[0];
    await queueNotification(client, result);
    await client.query("UPDATE platform_access_provisioning SET status='done',error=NULL,updated_at=now() WHERE request_id=$1", [job.request_id]);
    await client.query('COMMIT');
    console.log(`Provisioned ${companyId} for request ${request.id}`);
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

async function tick(ctx) {
  const claimed = await ctx.control.query(`WITH next AS (
      SELECT request_id FROM platform_access_provisioning WHERE status='pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
    ) UPDATE platform_access_provisioning p SET status='processing',updated_at=now() FROM next WHERE p.request_id=next.request_id RETURNING p.*`);
  const job = claimed.rows[0];
  if (!job) return false;
  try { await processJob(ctx, job); }
  catch (error) { await failJob(ctx.control, job.request_id, error); console.error('Provisioning failed', { requestId: job.request_id, error: sanitize(error) }); }
  return true;
}

async function main() {
  const registry = new Registry();
  const mongo = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 4 });
  const admin = new pg.Pool({ connectionString: process.env.PROVISION_DATABASE_URL, max: 2 });
  const control = new pg.Pool({ connectionString: process.env.CONTROL_DATABASE_URL, max: 2 });
  try {
    await mongo.connect();
    // Recover jobs interrupted by a previous shutdown; a live worker updates 'updated_at' continuously.
    await control.query("UPDATE platform_access_provisioning SET status='pending' WHERE status='processing' AND updated_at < now() - interval '10 minutes'");
    const ctx = { registry, mongo, admin, control };
    const loop = async () => { while (await tick(ctx)) {} };
    await loop();
    const timer = setInterval(() => void loop().catch(error => console.error('Provisioner tick failed', sanitize(error))), POLL_MS);
    timer.unref();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
      clearInterval(timer);
      await Promise.all([registry.close(), mongo.close(), admin.end(), control.end()]);
      process.exit(0);
    });
    console.log(`Provisioner running (poll ${POLL_MS}ms)`);
  } catch (error) {
    await Promise.allSettled([registry.close(), mongo.close(), admin.end(), control.end()]);
    throw error;
  }
}

if (process.argv[1]?.endsWith('provisioner.mjs')) main().catch(error => { console.error('Provisioner failed:', sanitize(error)); process.exitCode = 1; });
