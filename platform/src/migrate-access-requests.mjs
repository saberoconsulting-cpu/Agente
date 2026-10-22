import { Registry, controlSchema } from './registry.mjs';
import { decrypt } from './domain.mjs';
if (!process.argv.includes('--local')) throw new Error('This helper is for local development only');
if (!['localhost','127.0.0.1'].includes(new URL(process.env.CONTROL_DATABASE_URL).hostname)) throw new Error('Local database required');
const registry=new Registry();
try {
  await registry.control.query(controlSchema);
  const role=await registry.control.query("SELECT 1 FROM pg_roles WHERE rolname='sabero_platform_runtime'");
  if(role.rowCount) await registry.control.query('GRANT SELECT,INSERT,UPDATE ON platform_access_requests TO sabero_platform_runtime');
  if(role.rowCount) await registry.control.query('GRANT UPDATE(status,deleted_at) ON platform_companies TO sabero_platform_runtime');
  if(role.rowCount) await registry.control.query('GRANT SELECT,INSERT,UPDATE ON platform_access_notifications TO sabero_platform_runtime');
  const {rows}=await registry.control.query("SELECT c.* FROM platform_companies c JOIN platform_products p ON p.company_id=c.id WHERE c.status='active' AND p.product='agent' AND p.status='active'");
  for(const company of rows) {
    if(!['localhost','127.0.0.1'].includes(new URL(decrypt(company.encrypted_connection,registry.env.PLATFORM_ENCRYPTION_KEY)).hostname)) throw new Error('Remote company database refused');
    await (await registry.database(company)).query('CREATE TABLE IF NOT EXISTS platform.agent_access_activations(request_id uuid PRIMARY KEY,user_id uuid NOT NULL)');
  }
  console.log('Local applications table, runtime permissions and activation tracking ready.');
} finally {await registry.close();}
