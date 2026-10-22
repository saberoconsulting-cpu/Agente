// Executed only against the isolated database created by integration.test.mjs.
const assert = require('node:assert/strict');
const path = require('node:path');
const crm = path.resolve(__dirname, '../../../crm_inmobiliario/backend');
require(path.join(crm, 'node_modules/reflect-metadata'));
require(path.join(crm, 'node_modules/ts-node')).register({ project: path.join(crm, 'tsconfig.json') });
const { DataSource } = require(path.join(crm, 'node_modules/typeorm'));
const { ClientEntity } = require(path.join(crm, 'src/shared/infrastructure/entities/client.entity.ts'));
const { PlatformService } = require(path.join(crm, 'src/platform/platform.service.ts'));

async function main() {
  const db = new DataSource({ type: 'postgres', url: process.env.TEST_CRM_DATABASE, entities: [ClientEntity], synchronize: false });
  await db.initialize();
  try {
    const values = { PLATFORM_MANAGED: 'true', COMPANY_ID: 'empresa-a', PLATFORM_API_URL: process.env.TEST_PLATFORM_URL, PLATFORM_SERVICE_TOKEN: 'c'.repeat(64) };
    const service = new PlatformService({ get: key => values[key] }, db.getRepository(ClientEntity));
    await service.reconcile();
    let clients = await db.getRepository(ClientEntity).find();
    assert.equal(clients.length, 1);
    assert.equal(clients[0].sharedContactId, process.env.TEST_CONTACT_ID);
    clients[0].fullName = 'Juan actualizado desde CRM';
    await db.getRepository(ClientEntity).save(clients[0]);
    await service.reconcile();
    await service.reconcile();
    assert.equal((await db.query("SELECT count(*)::int AS count FROM platform.contact_outbox WHERE product='crm'"))[0].count, 0);
    assert.equal((await db.query('SELECT name FROM platform.contacts WHERE id=$1', [process.env.TEST_CONTACT_ID]))[0].name, 'Juan actualizado desde CRM');
    assert.equal((await db.getRepository(ClientEntity).find()).length, 1);
  } finally { await db.destroy(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
