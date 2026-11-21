import pg from 'pg';
import { MongoClient } from 'mongodb';
import { Registry, controlSchema } from './registry.mjs';
import { tenantId, products } from './domain.mjs';
import { createTenant, activateTenantProducts, exportConfig } from './provision.mjs';

export { migrateProduct, installContactSync, exportConfig } from './provision.mjs';

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
      admin = new pg.Pool({ connectionString: process.env.PROVISION_DATABASE_URL, max: 1 });
      mongo = await new MongoClient(process.env.MONGODB_URI).connect();
      await createTenant({ id, name: value, sector }, { control: registry.control, admin, mongo });
      console.log(`Company ${id} created; activate its products next`); return;
    }
    const { rows: [company] } = await registry.control.query('SELECT * FROM platform_companies WHERE id=$1', [id]);
    if (!company) throw new Error('Company not found');
    if (command === 'activate') {
      await activateTenantProducts(registry, id, products(value?.split(',')));
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
