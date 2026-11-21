import { Registry } from './registry.mjs';
import { decrypt } from './domain.mjs';
import { migrateProduct } from './provision.mjs';

// The default company is migrated by the backend against its own database URL.
const defaultCompany = process.argv[2] || 'sabero';
const registry = new Registry();
try {
  const { rows } = await registry.control.query(`SELECT c.* FROM platform_companies c
    WHERE c.deleted_at IS NULL AND c.id<>$1
    AND EXISTS (SELECT 1 FROM platform_products p WHERE p.company_id=c.id AND p.product='agent')
    ORDER BY c.id`, [defaultCompany]);
  for (const company of rows) {
    await migrateProduct('agent', decrypt(company.encrypted_connection, registry.env.PLATFORM_ENCRYPTION_KEY), company);
    console.log(`Agent migrations ready: ${company.id}`);
  }
} catch (error) {
  console.error('Agent tenant migration failed:', String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]'));
  process.exitCode = 1;
} finally {
  await registry.close();
}
