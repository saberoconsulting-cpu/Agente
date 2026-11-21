import { timingSafeEqual } from 'node:crypto';

export function adminAuthorized(expected, supplied) {
  if (typeof expected !== 'string' || expected.length < 32 || typeof supplied !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ROW_LIMIT = 500;
const CONCURRENCY = 5;
const CACHE_MS = Number(process.env.OVERVIEW_CACHE_MS ?? 20000);
const cache = new WeakMap();

export function invalidateCompanyOverview(registry) {
  cache.delete(registry);
}

export async function companyOverview(registry) {
  const hit = cache.get(registry);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const { rows } = await registry.control.query(`SELECT c.*,
    coalesce((SELECT json_agg(product) FROM platform_products WHERE company_id=c.id AND status='active'),'[]') AS products
    FROM platform_companies c WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT ${ROW_LIMIT}`);
  const items = new Array(rows.length);
  const load = async (company, index) => {
    const item = { id: company.id, name: company.name, sector: company.sector, status: company.status,
      products: company.products, created_at: company.created_at, metrics: null, contacts: [], events: [], activity: [] };
    if (company.status === 'active' && company.products.includes('agent')) {
      try {
        const db = await registry.database(company);
        const result = await db.query(`SELECT
          (SELECT count(*)::int FROM agent.leads WHERE company_id=$1) AS contacts,
          (SELECT count(*)::int FROM agent.conversations WHERE company_id=$1) AS conversations,
          (SELECT count(*)::int FROM agent.meetings WHERE company_id=$1 AND status='booked' AND start_time>=now()) AS meetings,
          (SELECT count(*)::int FROM agent.agent_events WHERE company_id=$1 AND event_type='ai.completion' AND created_at>=date_trunc('month',now())) AS ai_requests,
          (SELECT coalesce(sum((payload->>'total_tokens')::bigint),0)::text FROM agent.agent_events WHERE company_id=$1 AND event_type='ai.completion' AND created_at>=date_trunc('month',now())) AS tokens`, [company.id]);
        item.metrics = result.rows[0];
        item.contacts = (await db.query(`SELECT id,name,whatsapp_number,status,qualification->>'email' AS email FROM agent.leads WHERE company_id=$1 ORDER BY updated_at DESC LIMIT 20`, [company.id])).rows;
        item.events = (await db.query(`SELECT event_type,created_at FROM agent.agent_events WHERE company_id=$1 ORDER BY created_at DESC LIMIT 10`, [company.id])).rows;
        item.activity = (await db.query(`WITH days AS (
          SELECT generate_series(date_trunc('day',now() AT TIME ZONE 'UTC')-interval '6 days',date_trunc('day',now() AT TIME ZONE 'UTC'),interval '1 day') AS day
        ), activity AS (
          SELECT date_trunc('day',created_at AT TIME ZONE 'UTC') AS day,count(*)::int AS requests,
            coalesce(sum((payload->>'total_tokens')::bigint),0)::text AS tokens
          FROM agent.agent_events WHERE company_id=$1 AND event_type='ai.completion'
            AND created_at >= (date_trunc('day',now() AT TIME ZONE 'UTC')-interval '6 days') AT TIME ZONE 'UTC'
          GROUP BY 1
        ) SELECT to_char(d.day,'YYYY-MM-DD') AS date,coalesce(a.requests,0)::int AS requests,coalesce(a.tokens,'0') AS tokens
          FROM days d LEFT JOIN activity a ON a.day=d.day ORDER BY d.day`,[company.id])).rows;
      } catch { item.metrics = null; item.activity=[]; }
    }
    items[index] = item;
  };
  // Bounded parallelism: each company uses its own pool, but a small server should not open hundreds at once.
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map((company, offset) => load(company, i + offset)));
  }
  const value = { items, limit: ROW_LIMIT, generated_at: new Date().toISOString() };
  cache.set(registry, { at: Date.now(), value });
  return value;
}
