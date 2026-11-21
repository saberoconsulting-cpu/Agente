// Attaches an existing database as a platform company and activates its products.
// Usage (inside the provisioner container):
//   node src/attach-company.mjs ID NAME SECTOR DB_URL MONGO_DB agent[,crm]
import { Registry } from './registry.mjs';
import { tenantId, products, encrypt } from './domain.mjs';
import { activateTenantProducts } from './provision.mjs';

const [id, name, sector, url, mongoDb, list] = process.argv.slice(2);
if (!id || !name || !url || !mongoDb || !list) {
  console.error('Usage: node src/attach-company.mjs ID NAME SECTOR DB_URL MONGO_DB agent[,crm]');
  process.exit(1);
}
tenantId(id);
products(list.split(','));
if (!process.env.PLATFORM_ENCRYPTION_KEY) throw new Error('PLATFORM_ENCRYPTION_KEY is required');

const registry = new Registry();
try {
  const { rowCount } = await registry.control.query('SELECT 1 FROM platform_companies WHERE id=$1', [id]);
  if (!rowCount) {
    await registry.control.query(`INSERT INTO platform_companies(id,name,sector,database_name,encrypted_connection,mongo_database,status)
      VALUES($1,$2,$3,$4,$5,$6,'active')`, [id, name, sector || 'general', 'external-' + id, encrypt(url, process.env.PLATFORM_ENCRYPTION_KEY), mongoDb]);
  } else {
    await registry.control.query("UPDATE platform_companies SET status='active' WHERE id=$1", [id]);
  }
  await activateTenantProducts(registry, id, list.split(','));
  console.log(`Company ${id} attached with products ${list}`);
} finally { await registry.close(); }
