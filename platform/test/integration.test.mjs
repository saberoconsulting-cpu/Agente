import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { MongoClient } from 'mongodb';
import { Registry, contactSchema, controlSchema } from '../src/registry.mjs';
import { encrypt, tokenHash } from '../src/domain.mjs';
import { initializeMessages, saveMessage, listMessages } from '../src/messages.mjs';
import { upsertContact } from '../src/contacts.mjs';
import { createHandler } from '../src/server.mjs';
import { migrateProduct, installContactSync } from '../src/admin.mjs';

test('isolated companies, cross-product contacts, message deduplication and CRM migrations', {
  skip: !process.env.TEST_POSTGRES_URL || !process.env.TEST_MONGODB_URI,
}, async t => {
  const suffix = randomBytes(6).toString('hex');
  const names = [`platform_test_control_${suffix}`, `platform_test_a_${suffix}`, `platform_test_b_${suffix}`];
  const base = process.env.TEST_POSTGRES_URL;
  const urlFor = name => { const url = new URL(base); url.pathname = '/' + name; return url.toString(); };
  const admin = new pg.Pool({ connectionString: base });
  const key = 'a'.repeat(64);
  const tokenA = 'a'.repeat(64), tokenB = 'b'.repeat(64), tokenCrm = 'c'.repeat(64);
  const agentLeadId = randomUUID();
  const pools = [];
  let registry, mongo, server;
  try {
    for (const name of names) await admin.query(`CREATE DATABASE "${name}"`);
    registry = new Registry({ CONTROL_DATABASE_URL: urlFor(names[0]), PLATFORM_ENCRYPTION_KEY: key });
    await registry.control.query(controlSchema);
    mongo = await new MongoClient(process.env.TEST_MONGODB_URI).connect();
    for (const [index, id, token] of [[1, 'empresa-a', tokenA], [2, 'empresa-b', tokenB]]) {
      const pool = new pg.Pool({ connectionString: urlFor(names[index]) }); pools.push(pool);
      await pool.query(contactSchema);
      await initializeMessages(mongo.db(names[index]));
      await registry.control.query(`INSERT INTO platform_companies(id,name,sector,database_name,encrypted_connection,mongo_database,status)
        VALUES($1,$1,'real-estate',$2,$3,$2,'active')`, [id, names[index], encrypt(urlFor(names[index]), key)]);
      await registry.control.query("INSERT INTO platform_products(company_id,product,status) VALUES($1,'agent','active')", [id]);
      await registry.control.query("INSERT INTO platform_service_credentials(company_id,product,token_hash) VALUES($1,'agent',$2)", [id, tokenHash(token)]);
    }
    server = createServer(createHandler(registry, mongo));
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const request = (id, token, path, body) => fetch(baseUrl + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-company-id': id, authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

    await t.test('a company credential cannot select another company', async () => {
      assert.equal((await request('empresa-b', tokenA, '/v1/company')).status, 403);
      assert.equal((await request('empresa-a', tokenA, '/v1/company')).status, 200);
    });
    let common;
    await t.test('adding CRM preserves the same contact identity and database', async () => {
      common = await upsertContact(pools[0], 'agent', { externalId: agentLeadId, phone: '+51 999123456', name: 'Juan' });
      const crmContact = await upsertContact(pools[0], 'crm', { externalId: '1', phone: '51999123456' });
      assert.equal(crmContact.id, common.id);
      const anotherCompany = await upsertContact(pools[1], 'agent', { externalId: 'lead-1', phone: '51999123456' });
      assert.notEqual(anotherCompany.id, common.id);
      await registry.control.query("INSERT INTO platform_products(company_id,product,status) VALUES('empresa-a','crm','active')");
      await registry.control.query("INSERT INTO platform_service_credentials(company_id,product,token_hash) VALUES('empresa-a','crm',$1)", [tokenHash(tokenCrm)]);
      const company = await (await request('empresa-a', tokenCrm, '/v1/company')).json();
      assert.deepEqual(company.products.sort(), ['agent', 'crm']);
      assert.equal((await pools[0].query('SELECT count(*)::int AS count FROM platform.contacts')).rows[0].count, 1);
    });
    await t.test('MongoDB deduplicates per company and paginates equal timestamps without gaps', async () => {
      const db = mongo.db(names[1]);
      const message = { id: '001', conversationId: 'conversation-1', direction: 'inbound', messageType: 'text', providerMessageId: 'wamid-1', createdAt: '2026-01-01T00:00:00Z' };
      assert.equal((await saveMessage(db, message)).inserted, true);
      assert.equal((await saveMessage(db, { ...message, id: 'retry' })).inserted, false);
      await saveMessage(db, { ...message, id: '002', providerMessageId: 'wamid-2' });
      await saveMessage(db, { ...message, id: '003', providerMessageId: 'wamid-3', direction: 'outbound' });
      const first = await listMessages(db, { conversationId: 'conversation-1', limit: 2 });
      const second = await listMessages(db, { conversationId: 'conversation-1', limit: 2, cursor: first.nextCursor });
      assert.deepEqual(first.items.map(item => item.id), ['002', '003']);
      assert.deepEqual(second.items.map(item => item.id), ['001']);
      assert.equal((await saveMessage(mongo.db(names[2]), message)).inserted, true);
      const summary = await (await request('empresa-a', tokenA, '/v1/messages/summary', { conversationIds: ['conversation-1'], direction: 'inbound' })).json();
      assert.equal(summary.items[0].count, 2);
      assert.equal((await request('empresa-a', tokenCrm, '/v1/messages', message)).status, 403);
      const other = await (await request('empresa-b', tokenB, '/v1/messages?conversationId=conversation-1')).json();
      assert.equal(other.items.length, 1);
    });
    await t.test('suspension blocks credentials immediately', async () => {
      await registry.control.query("UPDATE platform_companies SET status='suspended' WHERE id='empresa-a'");
      assert.equal((await request('empresa-a', tokenA, '/v1/company')).status, 403);
      await registry.control.query("UPDATE platform_companies SET status='active' WHERE id='empresa-a'");
    });
    await t.test('acknowledging an old contact version cannot lose a newer change', async () => {
      const inbox = await (await request('empresa-a', tokenA, '/v1/contact-inbox')).json();
      const version = inbox.items[0].version;
      await upsertContact(pools[0], 'crm', { externalId: '1', phone: '51999123456', name: 'Juan editado' });
      await request('empresa-a', tokenA, '/v1/contact-inbox/ack', { id: common.id, version });
      const pending = await (await request('empresa-a', tokenA, '/v1/contact-inbox')).json();
      assert.equal(pending.items.length, 1);
      assert.notEqual(pending.items[0].version, version);
      await upsertContact(pools[0], 'agent', { externalId: agentLeadId, phone: '51999123456', name: 'Nombre anterior del agente' });
      assert.equal((await pools[0].query('SELECT name FROM platform.contacts WHERE id=$1', [common.id])).rows[0].name, 'Juan editado');
    });
    await t.test('CRM migrates a fresh enterprise database without demo data', async () => {
      await migrateProduct('crm', urlFor(names[1]), { id: 'empresa-a' });
      assert.equal((await pools[0].query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0);
      assert.equal((await pools[0].query('SELECT count(*)::int AS count FROM clients')).rows[0].count, 0);
      assert.equal((await pools[0].query('SELECT count(*)::int AS count FROM platform.contacts')).rows[0].count, 1);
      await migrateProduct('crm', urlFor(names[1]), { id: 'empresa-a' });
      assert.equal((await pools[0].query("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='clients' AND column_name='shared_contact_id'")).rows[0].count, 1);
    });
    await t.test('CRM imports shared contacts and publishes edits through its persistent outbox', async () => {
      // Remove the synthetic CRM link used above; the real adapter will create its own client.
      await pools[0].query("DELETE FROM platform.contact_links WHERE product='crm'");
      await new Promise((done, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('./crm-adapter.cjs', import.meta.url))], {
          env: { ...process.env, TEST_CRM_DATABASE: urlFor(names[1]), TEST_PLATFORM_URL: baseUrl, TEST_CONTACT_ID: common.id },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? done() : reject(new Error(stderr)));
      });
    });
    await t.test('agent adapter receives CRM edits without duplicating leads', async () => {
      // Minimal relational fixture: this tests contact routing, not the pgvector migration.
      await pools[0].query(`CREATE SCHEMA agent; CREATE TABLE agent.leads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id text NOT NULL,whatsapp_number text NOT NULL,
        name text,UNIQUE(company_id,whatsapp_number))`);
      await installContactSync('agent', urlFor(names[1]));
      await pools[0].query("INSERT INTO agent.leads(id,company_id,whatsapp_number,name) VALUES($1,'empresa-a','51999123456','Juan')", [agentLeadId]);
      await new Promise((done, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('./agent-adapter.cjs', import.meta.url))], {
          env: { ...process.env, TEST_AGENT_DATABASE: urlFor(names[1]), TEST_PLATFORM_URL: baseUrl, TEST_CONTACT_ID: common.id },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        let stderr = '';
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? done() : reject(new Error(stderr)));
      });
    });
  } finally {
    if (server) await new Promise(done => server.close(done));
    await registry?.close();
    await Promise.all(pools.map(pool => pool.end()));
    if (mongo) { for (const name of names.slice(1)) await mongo.db(name).dropDatabase(); await mongo.close(); }
    for (const name of names) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
