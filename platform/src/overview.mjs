import { timingSafeEqual } from 'node:crypto';

export function adminAuthorized(expected, supplied) {
  if (typeof expected !== 'string' || expected.length < 32 || typeof supplied !== 'string') return false;
  const a = Buffer.from(expected), b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function companyOverview(registry) {
  const { rows } = await registry.control.query(`SELECT c.*,
    coalesce((SELECT json_agg(product) FROM platform_products WHERE company_id=c.id AND status='active'),'[]') AS products
    FROM platform_companies c WHERE c.deleted_at IS NULL ORDER BY c.created_at DESC LIMIT 100`);
  const items = [];
  // Sequential to avoid opening hundreds of connections on a small server.
  for (const company of rows) {
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
    items.push(item);
  }
  return { items, limit: 100, generated_at: new Date().toISOString() };
}
