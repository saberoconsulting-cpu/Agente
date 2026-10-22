import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  async usage(companyId: string) {
    const result = await this.db.query(`select count(*)::int as requests,
      count(*) filter(where payload->>'total_tokens' is not null)::int as measured_requests,
      coalesce(sum((payload->>'prompt_tokens')::bigint),0)::text as input_tokens,
      coalesce(sum((payload->>'completion_tokens')::bigint),0)::text as output_tokens,
      coalesce(sum((payload->>'total_tokens')::bigint),0)::text as total_tokens,
      min(created_at) as first_recorded_at
      from agent_events where company_id=$1 and event_type='ai.completion'
      and created_at >= date_trunc('month',now())`, [companyId]);
    return { company_id: companyId, period: 'current_month', ...result.rows[0] };
  }

  async summary(companyId: string) {
    const [
      leads,
      conversations,
      documents,
      meetings,
      followups,
      events,
      integrations,
      opportunities,
      sales,
    ] = await Promise.all([
      this.db.query<{ count: string }>('select count(*)::text from leads where company_id = $1', [companyId]),
      this.db.query<{ count: string }>('select count(*)::text from conversations where company_id = $1', [companyId]),
      this.db.query<{ count: string }>('select count(*)::text from knowledge_documents where company_id = $1', [companyId]),
      this.db.query<{ count: string }>(
        `select count(*)::text
         from meetings
         where company_id = $1 and status = 'booked' and start_time >= now()`,
        [companyId],
      ),
      this.db.query<{ count: string }>(
        `select count(*)::text
         from followups
         where company_id = $1 and status = 'scheduled'`,
        [companyId],
      ),
      this.db.query(
        `select event_type, aggregate_type, aggregate_id, payload, created_at
         from agent_events
         where company_id = $1
         order by created_at desc
         limit 10`,
        [companyId],
      ),
      this.db.query<{ google_connected: boolean; drive_files: string }>(
        `select
           exists (
             select 1 from google_oauth_connections
             where company_id = $1 and revoked_at is null
           ) as google_connected,
           (select count(*)::text from google_drive_files where company_id = $1) as drive_files`,
        [companyId],
      ),
      this.db.query<{ open: string; hot: string; unassigned: string; proposed: string; won: string }>(
        `select count(*) filter (where stage not in ('ganado','perdido'))::text as open,
          count(*) filter (where score >= 60 and stage = 'nuevo')::text as hot,
          count(*) filter (where assignee_id is null and stage not in ('ganado','perdido'))::text as unassigned,
          count(*) filter (where stage = 'propuesta')::text as proposed,
          count(*) filter (where stage = 'ganado')::text as won from opportunities where company_id = $1`, [companyId]),
      this.db.query(
        `with month as (select date_trunc('month', now()) as starts_at), activity as (
          select oa.opportunity_id, oa.activity_type, oa.content from opportunity_activities oa, month
          where oa.company_id = $1 and oa.created_at >= month.starts_at
        )
        select
          (select count(*)::text from opportunities o, month where o.company_id = $1 and o.created_at >= month.starts_at) as created,
          (select count(distinct opportunity_id)::text from activity where activity_type = 'opportunity.stage_changed' and content = 'Etapa: calificado') as qualified,
          (select count(*)::text from meetings m, month where m.company_id = $1 and m.status = 'booked' and m.created_at >= month.starts_at) as meetings,
          (select count(distinct opportunity_id)::text from activity where activity_type = 'opportunity.proposal_created') as proposals,
          (select count(distinct opportunity_id)::text from activity where activity_type = 'opportunity.stage_changed' and content = 'Etapa: ganado') as won,
          (select count(distinct opportunity_id)::text from activity where activity_type = 'opportunity.stage_changed' and content = 'Etapa: perdido') as lost,
          (select coalesce(sum(estimated_value), 0)::text from opportunities where company_id = $1 and stage not in ('ganado','perdido')) as pipeline_value,
          (select coalesce(sum(o.estimated_value), 0)::text from opportunities o join activity a on a.opportunity_id = o.id where a.activity_type = 'opportunity.stage_changed' and a.content = 'Etapa: ganado') as won_value,
          (select count(*)::text from opportunity_followup_drafts where company_id = $1 and status = 'pending') as pending_drafts,
          coalesce((select json_agg(row_to_json(x)) from (
            select coalesce(u.email, 'Sin asignar') as label, count(*)::int as count, coalesce(sum(o.estimated_value), 0)::text as value
            from opportunities o left join admin_users u on u.id = o.assignee_id
            where o.company_id = $1 and o.stage not in ('ganado','perdido') group by u.email order by count(*) desc limit 8
          ) x), '[]'::json) as by_assignee,
          coalesce((select json_agg(row_to_json(x)) from (
            select coalesce(nullif(service_interest, ''), 'Sin definir') as label, count(*)::int as count, coalesce(sum(estimated_value), 0)::text as value
            from opportunities where company_id = $1 and stage not in ('ganado','perdido') group by service_interest order by count(*) desc limit 8
          ) x), '[]'::json) as by_service`, [companyId]),
    ]);

    return {
      company_id: companyId,
      metrics: {
        leads: Number(leads.rows[0].count),
        conversations: Number(conversations.rows[0].count),
        indexed_documents: Number(documents.rows[0].count),
        upcoming_meetings: Number(meetings.rows[0].count),
        scheduled_followups: Number(followups.rows[0].count),
      },
      integrations: {
        google_connected: integrations.rows[0]?.google_connected || false,
        drive_files: Number(integrations.rows[0]?.drive_files || 0),
      },
      opportunities: { open: Number(opportunities.rows[0]?.open || 0), hot: Number(opportunities.rows[0]?.hot || 0), unassigned: Number(opportunities.rows[0]?.unassigned || 0), proposed: Number(opportunities.rows[0]?.proposed || 0), won: Number(opportunities.rows[0]?.won || 0) },
      sales: {
        created: Number(sales.rows[0]?.created || 0), qualified: Number(sales.rows[0]?.qualified || 0), meetings: Number(sales.rows[0]?.meetings || 0), proposals: Number(sales.rows[0]?.proposals || 0), won: Number(sales.rows[0]?.won || 0), lost: Number(sales.rows[0]?.lost || 0),
        pipeline_value: Number(sales.rows[0]?.pipeline_value || 0), won_value: Number(sales.rows[0]?.won_value || 0), pending_drafts: Number(sales.rows[0]?.pending_drafts || 0),
        conversion: (() => {
          const created = Number(sales.rows[0]?.created || 0);
          return {
            qualified: created ? Math.round(Number(sales.rows[0]?.qualified || 0) / created * 100) : 0,
            meetings: created ? Math.round(Number(sales.rows[0]?.meetings || 0) / created * 100) : 0,
            proposals: created ? Math.round(Number(sales.rows[0]?.proposals || 0) / created * 100) : 0,
            won: created ? Math.round(Number(sales.rows[0]?.won || 0) / created * 100) : 0,
          };
        })(),
        by_assignee: sales.rows[0]?.by_assignee || [], by_service: sales.rows[0]?.by_service || [],
      },
      recent_events: events.rows,
    };
  }
}
