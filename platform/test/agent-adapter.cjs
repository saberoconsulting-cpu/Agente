const assert = require('node:assert/strict');
const path = require('node:path');
const agent = path.resolve(__dirname, '../../backend');
require(path.join(agent, 'node_modules/reflect-metadata'));
require(path.join(agent, 'node_modules/ts-node')).register({ project: path.join(agent, 'tsconfig.json') });
const { DatabaseService } = require(path.join(agent, 'src/modules/database/database.service.ts'));
const { PlatformService } = require(path.join(agent, 'src/modules/platform/platform.service.ts'));

async function main() {
  const values = { DATABASE_URL: process.env.TEST_AGENT_DATABASE, DATABASE_SCHEMA: 'agent', DATABASE_SSL: 'false',
    PLATFORM_MANAGED: 'true', COMPANY_ID: 'empresa-a', PLATFORM_API_URL: process.env.TEST_PLATFORM_URL, PLATFORM_SERVICE_TOKEN: 'a'.repeat(64) };
  const config = { get: key => values[key] };
  const db = new DatabaseService(config);
  try {
    const service = new PlatformService(config, db);
    await service.reconcile();
    await service.reconcile();
    const leads = (await db.query('SELECT * FROM leads')).rows;
    assert.equal(leads.length, 1);
    assert.equal(leads[0].name, 'Juan actualizado desde CRM');
    assert.equal((await db.query("SELECT count(*)::int AS count FROM platform.contact_outbox WHERE product='agent'" )).rows[0].count, 0);
  } finally { await db.onModuleDestroy(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
