import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class OpportunitiesRepository {
  constructor(private readonly db: DatabaseService) {}
  list(companyId: string, stage?: string, assigneeId?: string, minScore?: number) { return this.db.query(`select o.*, l.name as lead_name, l.whatsapp_number, u.email as assignee_email from opportunities o join leads l on l.id = o.lead_id left join admin_users u on u.id = o.assignee_id where o.company_id = $1 and ($2::text is null or o.stage = $2) and ($3::uuid is null or o.assignee_id = $3) and ($4::integer is null or o.score >= $4) order by o.score desc, o.last_activity_at desc`, [companyId, stage || null, assigneeId || null, minScore ?? null]); }
  find(companyId: string, id: string) { return this.db.query('select * from opportunities where id = $1 and company_id = $2', [id, companyId]); }
  activities(id: string) { return this.db.query('select * from opportunity_activities where opportunity_id = $1 order by created_at desc', [id]); }
  proposals(companyId: string, id: string) { return this.db.query('select id, status, title, content, created_at, updated_at from opportunity_proposals where opportunity_id = $1 and company_id = $2 order by created_at desc', [id, companyId]); }
  leadForScoring(companyId: string, leadId: string) { return this.db.query<{ qualification: Record<string, string>; updated_at: string }>('select qualification, updated_at from leads where id = $1 and company_id = $2', [leadId, companyId]); }
  create(companyId: string, leadId: string, conversationId: string | undefined, score: number, signals: unknown, interest: string | undefined) { return this.db.query(`insert into opportunities (company_id, lead_id, conversation_id, stage, score, score_signals, service_interest, last_activity_at) values ($1,$2,$3,'nuevo',$4,$5,$6,now()) on conflict (company_id, lead_id) where stage not in ('ganado','perdido') do update set score = excluded.score, score_signals = excluded.score_signals, last_activity_at = now() returning *`, [companyId, leadId, conversationId || null, score, JSON.stringify(signals), interest || null]); }
  updateStage(companyId: string, id: string, stage: string, lossReason?: string) { return this.db.query(`update opportunities set stage = $3, loss_reason = case when $3 = 'perdido' then $4 else loss_reason end, last_activity_at = now(), updated_at = now() where id = $1 and company_id = $2 returning *`, [id, companyId, stage, lossReason || null]); }
  activeSeller(companyId: string, id: string) { return this.db.query(`select id from admin_users where id = $1 and company_id = $2 and active and role in ('owner','admin')`, [id, companyId]); }
  assign(companyId: string, id: string, assigneeId: string) { return this.db.query('update opportunities set assignee_id = $3, last_activity_at = now(), updated_at = now() where id = $1 and company_id = $2 returning *', [id, companyId, assigneeId]); }
  updateNote(companyId: string, id: string, nextAction?: string) { return this.db.query('update opportunities set next_action = coalesce($3, next_action), last_activity_at = now(), updated_at = now() where id = $1 and company_id = $2', [id, companyId, nextAction || null]); }
  recordActivity(companyId: string, id: string, actorId: string | undefined, type: string, content: string) { return this.db.query('insert into opportunity_activities (company_id, opportunity_id, actor_id, activity_type, content) values ($1,$2,$3,$4,$5)', [companyId, id, actorId, type, content]); }
  companies() { return this.db.query<{ id: string }>('select id from companies'); }
}
