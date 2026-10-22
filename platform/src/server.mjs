import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { Registry } from './registry.mjs';
import { upsertContact } from './contacts.mjs';
import { initializeMessages, listMessages, saveMessage } from './messages.mjs';
import { pageLimit } from './domain.mjs';
import { adminAuthorized, companyOverview } from './overview.mjs';
import { listRequests, reviewRequest, submitRequest } from './access-requests.mjs';
import { dispatchNotifications,retryNotification } from './access-notifications.mjs';
import {changeCompanyAccess} from './company-access.mjs';

export function createHandler(registry, mongo) {
  return async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health' && req.method === 'GET') return send(200, { status: 'ok' });
      let body = {};
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) {
          raw += chunk;
          const limit = url.pathname.includes('access-requests') ? 16 * 1024 : 1024 * 1024;
          if (Buffer.byteLength(raw) > limit) return send(413, { error: 'Payload too large' });
        }
        try { body = JSON.parse(raw); } catch { return send(400, { error: 'Invalid JSON' }); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'Invalid body' });
      }
      if (url.pathname.startsWith('/v1/admin/access-requests')) {
        const credential = req.headers.authorization?.replace(/^Bearer /, '');
        if (!adminAuthorized(registry.env.PLATFORM_ADMIN_TOKEN, credential)) return send(403, { error: 'Platform administrator required' });
        if (url.pathname === '/v1/admin/access-requests' && req.method === 'GET') return send(200, await listRequests(registry));
        const match = url.pathname.match(/^\/v1\/admin\/access-requests\/([a-f0-9-]{36})$/i);
        if (match && req.method === 'DELETE') {
          const result = await registry.control.query("UPDATE platform_access_requests SET deleted_at=now(),updated_at=now(),status=CASE WHEN status IN ('pending','approved') THEN 'rejected' ELSE status END WHERE id=$1 AND deleted_at IS NULL RETURNING id", [match[1]]);
          return send(result.rowCount ? 200 : 404, result.rowCount ? {removed:true} : {error:'Request not found'});
        }
        if (match && req.method === 'POST') {
          if(body.action==='retry_notification')return send(200,await retryNotification(registry,match[1]));
          const result=await reviewRequest(registry,match[1],body);
          // A provider outage must never undo a committed payment or account decision.
          try {await dispatchNotifications(registry,{requestId:match[1],limit:1});} catch {console.error('Application email remains queued');}
          return send(200,result);
        }
        return send(404, { error: 'Not found' });
      }
      if (url.pathname.startsWith('/v1/admin/companies') && ['GET','DELETE','POST'].includes(req.method)) {
        const credential = req.headers.authorization?.replace(/^Bearer /, '');
        if (!adminAuthorized(registry.env.PLATFORM_ADMIN_TOKEN, credential)) return send(403, { error: 'Platform administrator required' });
        if(url.pathname === '/v1/admin/companies' && req.method === 'GET') return send(200, await companyOverview(registry));
        const accessMatch=url.pathname.match(/^\/v1\/admin\/companies\/([a-z0-9][a-z0-9-]{0,62})\/access$/);
        if(accessMatch&&req.method==='POST')return send(200,await changeCompanyAccess(registry,accessMatch[1],body));
        const match=url.pathname.match(/^\/v1\/admin\/companies\/([a-z0-9][a-z0-9-]{0,62})$/);
        if(match && req.method === 'DELETE') {
          if(!registry.env.PLATFORM_ADMIN_COMPANY_ID || match[1]===registry.env.PLATFORM_ADMIN_COMPANY_ID) return send(403,{error:'Administrator company is protected'});
          const result=await registry.control.query("UPDATE platform_companies SET status='suspended',deleted_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING id",[match[1]]);
          return send(result.rowCount?200:404,result.rowCount?{removed:true}:{error:'Company not found'});
        }
        return send(404,{error:'Not found'});
      }
      const id = req.headers['x-company-id'];
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      if (typeof id !== 'string') return send(401, { error: 'Service authentication required' });
      const company = await registry.authenticate(id, token);
      if (!company) return send(403, { error: 'Company or product disabled, or invalid credentials' });
      const db = mongo.db(company.mongo_database);
      if (url.pathname === '/v1/access-requests' && req.method === 'POST') {
        if (id !== registry.env.PLATFORM_ADMIN_COMPANY_ID || company.product !== 'agent') return send(403, { error: 'Only SABERO accepts applications' });
        return send(202, await submitRequest(registry, id, body));
      }
      if (url.pathname === '/v1/company' && req.method === 'GET') {
        const { rows } = await registry.control.query("SELECT product FROM platform_products WHERE company_id=$1 AND status='active'", [id]);
        return send(200, { id, name: company.name, sector: company.sector, products: rows.map(row => row.product) });
      }
      if (url.pathname === '/v1/contacts' && req.method === 'POST') {
        return send(200, await upsertContact(await registry.database(company), company.product, body));
      }
      if (url.pathname === '/v1/contacts' && req.method === 'GET') {
        const after = url.searchParams.get('after');
        if (after && !/^[a-f0-9-]{36}$/i.test(after)) return send(400, { error: 'Invalid contact cursor' });
        const pool = await registry.database(company);
        const { rows } = await pool.query(`SELECT c.*, (SELECT jsonb_object_agg(l.product,l.external_id) FROM platform.contact_links l WHERE l.contact_id=c.id) AS links
          FROM platform.contacts c WHERE ($1::uuid IS NULL OR c.id>$1::uuid) ORDER BY c.id LIMIT $2`, [after, pageLimit(url.searchParams.get('limit') || 100)]);
        return send(200, { items: rows, nextCursor: rows.at(-1)?.id || null });
      }
      if (url.pathname === '/v1/contact-inbox' && req.method === 'GET') {
        const pool = await registry.database(company);
        const { rows } = await pool.query(`SELECT c.*, i.version,
          (SELECT jsonb_object_agg(l.product,l.external_id) FROM platform.contact_links l WHERE l.contact_id=c.id) AS links
          FROM platform.contact_inbox i JOIN platform.contacts c ON c.id=i.contact_id WHERE i.product=$1 ORDER BY c.id LIMIT 100`, [company.product]);
        return send(200, { items: rows });
      }
      if (url.pathname === '/v1/contact-inbox/ack' && req.method === 'POST') {
        if (![body.id, body.version].every(v => typeof v === 'string' && /^[a-f0-9-]{36}$/i.test(v))) throw new Error('Invalid acknowledgment');
        await (await registry.database(company)).query('DELETE FROM platform.contact_inbox WHERE product=$1 AND contact_id=$2 AND version=$3', [company.product, body.id, body.version]);
        return send(200, { acknowledged: true });
      }
      if (url.pathname === '/v1/messages' && req.method === 'POST') {
        if (company.product !== 'agent') return send(403, { error: 'Only agent can record channel messages' });
        return send(200, await saveMessage(db, body));
      }
      if (url.pathname === '/v1/messages' && req.method === 'GET') return send(200, await listMessages(db, Object.fromEntries(url.searchParams)));
      if (url.pathname === '/v1/contact-messages' && req.method === 'GET') {
        const contactId = url.searchParams.get('contactId');
        if (!/^[a-f0-9-]{36}$/i.test(contactId || '')) return send(400, { error: 'Invalid contact ID' });
        const pool = await registry.database(company);
        const exists = await pool.query("SELECT to_regclass('agent.conversations') AS table_name");
        if (!exists.rows[0].table_name) return send(200, { items: [], nextCursor: null });
        const { rows } = await pool.query(`SELECT c.id FROM agent.conversations c JOIN platform.contact_links l
          ON l.external_id=c.lead_id::text AND l.product='agent' WHERE l.contact_id=$1::uuid AND c.company_id=$2`, [contactId, company.id]);
        return send(200, await listMessages(db, Object.fromEntries(url.searchParams), rows.map(row => row.id)));
      }
      if (url.pathname === '/v1/messages/summary' && req.method === 'POST') {
        if (body.direction && !['inbound', 'outbound'].includes(body.direction)) throw new Error('Invalid direction');
        if (!Array.isArray(body.conversationIds) || body.conversationIds.length > 200 || body.conversationIds.some(v => typeof v !== 'string')) throw new Error('Invalid conversations');
        const match = { conversationId: { $in: body.conversationIds }, ...(body.direction ? { direction: body.direction } : {}) };
        const items = await db.collection('messages').aggregate([{ $match: match }, { $group: { _id: '$conversationId', count: { $sum: 1 }, lastMessageAt: { $max: '$createdAt' } } }]).toArray();
        return send(200, { items });
      }
      if (url.pathname === '/v1/inbound-events' && req.method === 'POST' && company.product === 'agent') {
        const eventId = randomUUID();
        await db.collection('inbound_events').insertOne({ id: eventId, provider: 'meta_whatsapp', payload: body, createdAt: new Date() });
        return send(200, { id: eventId });
      }
      send(404, { error: 'Not found' });
    } catch (error) {
      const status = error.status || (/Invalid|required|must|Phone|Products/.test(error.message) ? 400 : 503);
      if (status === 503) console.error('Platform operation failed', { code: error.code || 'internal' });
      send(status, { error: status === 503 ? 'Service temporarily unavailable' : error.message });
    }
  };
}

export async function start() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  const registry = new Registry();
  const mongo = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000 });
  try {
    await mongo.connect();
    const { rows } = await registry.control.query("SELECT mongo_database FROM platform_companies WHERE status='active'");
    for (const company of rows) await initializeMessages(mongo.db(company.mongo_database));
    const server = createServer(createHandler(registry, mongo));
    server.requestTimeout = 15000;
    server.listen(Number(process.env.PORT || 3010), process.env.HOST || '127.0.0.1');
    let sending=false;
    const dispatch=async()=>{if(sending)return;sending=true;try{await dispatchNotifications(registry);}catch{console.error('Application notification retry pending');}finally{sending=false;}};
    const timer=setInterval(()=>void dispatch(),30000);timer.unref();
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {clearInterval(timer);server.close(async () => { await registry.close(); await mongo.close(); });});
  } catch (error) { await registry.close(); await mongo.close(); throw error; }
}

if (process.argv[1]?.endsWith('server.mjs')) start().catch(error => { console.error('Platform startup failed', { code: error.code || error.name }); process.exitCode = 1; });
