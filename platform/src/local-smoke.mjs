import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import pg from 'pg';
import { MongoClient } from 'mongodb';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const dotenv = require(resolve(root, 'backend/node_modules/dotenv'));
const agent = dotenv.parse(await readFile(resolve(root, 'backend/.env')));
const platform = dotenv.parse(await readFile(resolve(root, 'platform/.env')));
const database = new URL(agent.DATABASE_URL);
if (database.hostname !== '127.0.0.1' || database.port !== '55432' || agent.PLATFORM_MANAGED !== 'true') throw new Error('This check only runs against the dedicated local stack');
const pool = new pg.Pool({ connectionString: agent.DATABASE_URL, options: '-c search_path=agent,public', max: 2 });
const control = new pg.Pool({ connectionString: platform.CONTROL_DATABASE_URL, max: 1 });
const mongo = new MongoClient(platform.MONGODB_URI);
const leadId = randomUUID(), conversationId = randomUUID(), messageId = randomUUID();
const phone = '999' + Date.now().toString().slice(-9);
let mongoDatabase;
let clientId;
let contactId;
try {
  const vector = await pool.query("select '[1,0,0]'::vector <-> '[0,1,0]'::vector as distance");
  assert.ok(vector.rows[0].distance > 1.4);
  console.log('pgvector-query: OK');
  const migrations = await pool.query('select count(*)::int as count from agent._prisma_migrations where finished_at is not null');
  assert.ok(migrations.rows[0].count > 0);
  console.log('agent-prisma-migrations: OK');
  const company = (await control.query('select mongo_database from platform_companies where id=$1', [agent.COMPANY_ID])).rows[0];
  mongoDatabase = company.mongo_database;
  await mongo.connect();
  await pool.query('insert into agent.leads(id,company_id,whatsapp_number,name) values($1,$2,$3,$4)', [leadId, agent.COMPANY_ID, phone, 'Verificacion local temporal']);
  await pool.query("insert into agent.conversations(id,company_id,lead_id,channel,external_id) values($1,$2,$3,'whatsapp',$4)", [conversationId, agent.COMPANY_ID, leadId, `local-check:${leadId}`]);
  const saved = await fetch(`${agent.PLATFORM_API_URL}/v1/messages`, { method: 'POST',
    headers: { Authorization: `Bearer ${agent.PLATFORM_SERVICE_TOKEN}`, 'X-Company-Id': agent.COMPANY_ID, 'content-type': 'application/json' },
    body: JSON.stringify({ id: messageId, conversationId, providerMessageId: `local-check:${messageId}`, direction: 'inbound', messageType: 'text',
      textBody: 'Verificacion local de historial compartido; no se envia a WhatsApp.' }) });
  assert.equal(saved.status, 200);
  console.log('mongo-message-write: OK (no WhatsApp request)');
  console.log('Waiting for the running agent and CRM to synchronize the temporary contact...');
  const end = Date.now() + 150000;
  while (Date.now() < end) {
    const result = await pool.query(`select c.id,c.shared_contact_id from public.clients c join platform.contact_links l on l.contact_id=c.shared_contact_id
      where l.product='agent' and l.external_id=$1`, [leadId]);
    if (result.rows[0]) { clientId = result.rows[0].id; contactId = result.rows[0].shared_contact_id; break; }
    await new Promise(done => setTimeout(done, 1000));
  }
  assert.ok(clientId, 'The running services did not synchronize the contact');
  console.log('running-agent-to-crm-contact: OK');
  const login = await fetch('http://127.0.0.1:3002/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: agent.ADMIN_EMAIL, password: agent.ADMIN_PASSWORD }) });
  assert.ok(login.ok, `CRM login failed (${login.status})`);
  const session = await login.json();
  const response = await fetch(`http://127.0.0.1:3002/api/clients/${clientId}/messages`, { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(response.status, 200);
  assert.ok((await response.json()).items.some(message => message.id === messageId));
  console.log('crm-reads-agent-mongo-history: OK');
} catch (error) {
  console.error(error.message.replace(/(?:postgres(?:ql)?|mongodb):\/\/\S+/g, '[connection redacted]'));
  process.exitCode = 1;
} finally {
  // Delete only the records identified by this check's randomly generated IDs.
  const linked = await pool.query("select contact_id from platform.contact_links where product='agent' and external_id=$1", [leadId]);
  contactId ||= linked.rows[0]?.contact_id;
  if (contactId) {
    const crmLinks = await pool.query("select external_id from platform.contact_links where product='crm' and contact_id=$1", [contactId]);
    for (const row of crmLinks.rows) {
      await pool.query('delete from public.clients where id=$1 and shared_contact_id=$2', [Number(row.external_id), contactId]);
      await pool.query("delete from platform.contact_outbox where product='crm' and external_id=$1", [row.external_id]);
    }
    await pool.query('delete from platform.contact_inbox where contact_id=$1', [contactId]);
    await pool.query('delete from platform.contact_links where contact_id=$1', [contactId]);
    await pool.query('delete from platform.contacts where id=$1', [contactId]);
  }
  await pool.query('delete from agent.conversations where id=$1', [conversationId]);
  await pool.query('delete from agent.leads where id=$1', [leadId]);
  await pool.query("delete from platform.contact_outbox where product='agent' and external_id=$1", [leadId]);
  if (mongoDatabase) await mongo.db(mongoDatabase).collection('messages').deleteOne({ id: messageId });
  await mongo.close(); await pool.end(); await control.end();
  console.log('temporary-check-records-removed: OK');
}
