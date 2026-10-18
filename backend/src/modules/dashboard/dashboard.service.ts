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
      recent_events: events.rows,
    };
  }
}
