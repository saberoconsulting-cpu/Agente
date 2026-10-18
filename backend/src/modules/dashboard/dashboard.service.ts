import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

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
      recent_events: events.rows,
    };
  }
}
