import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';

const stages = ['nuevo', 'calificado', 'reunion_propuesta', 'reunion_agendada', 'propuesta', 'ganado', 'perdido'];
const closedStages = ['ganado', 'perdido'];

@Injectable()
export class OpportunitiesService {
  constructor(private readonly db: DatabaseService, private readonly events: EventsService, private readonly audit: AuditService) {}

  async list(companyId: string, filters: { stage?: string; assignee_id?: string; min_score?: number } = {}) {
    const result = await this.db.query(
      `select o.*, l.name as lead_name, l.whatsapp_number, u.email as assignee_email
       from opportunities o join leads l on l.id = o.lead_id
       left join admin_users u on u.id = o.assignee_id
       where o.company_id = $1 and ($2::text is null or o.stage = $2)
         and ($3::uuid is null or o.assignee_id = $3) and ($4::integer is null or o.score >= $4)
       order by o.score desc, o.last_activity_at desc`,
      [companyId, filters.stage || null, filters.assignee_id || null, filters.min_score ?? null],
    );
    return result.rows;
  }

  async detail(companyId: string, id: string) {
    const opportunity = await this.db.query(`select * from opportunities where id = $1 and company_id = $2`, [id, companyId]);
    if (!opportunity.rowCount) throw new NotFoundException('Opportunity not found');
    const activities = await this.db.query(`select * from opportunity_activities where opportunity_id = $1 order by created_at desc`, [id]);
    const proposals = await this.db.query(`select id, status, title, content, created_at, updated_at from opportunity_proposals where opportunity_id = $1 and company_id = $2 order by created_at desc`, [id, companyId]);
    return { ...opportunity.rows[0], activities: activities.rows, proposals: proposals.rows };
  }

  async create(companyId: string, actorId: string, input: { lead_id: string; conversation_id?: string; service_interest?: string }) {
    const lead = await this.db.query<{ qualification: Record<string, string>; updated_at: string }>(`select qualification, updated_at from leads where id = $1 and company_id = $2`, [input.lead_id, companyId]);
    if (!lead.rowCount) throw new NotFoundException('Lead not found');
    const scored = this.score(lead.rows[0].qualification || {}, lead.rows[0].updated_at);
    const result = await this.db.query(
      `insert into opportunities (company_id, lead_id, conversation_id, stage, score, score_signals, service_interest, last_activity_at)
       values ($1, $2, $3, 'nuevo', $4, $5, $6, now())
       on conflict (company_id, lead_id) where stage not in ('ganado', 'perdido') do update set score = excluded.score, score_signals = excluded.score_signals, last_activity_at = now()
       returning *`,
      [companyId, input.lead_id, input.conversation_id || null, scored.score, JSON.stringify(scored.signals), input.service_interest || null],
    );
    await this.activity(companyId, result.rows[0].id, actorId, 'opportunity.created', 'Oportunidad creada');
    return result.rows[0];
  }

  async confirm(companyId: string, id: string, actorId: string) { return this.changeStage(companyId, id, 'calificado', actorId); }

  async changeStage(companyId: string, id: string, stage: string, actorId: string, lossReason?: string) {
    if (!stages.includes(stage)) throw new BadRequestException('Invalid opportunity stage');
    const result = await this.db.query(
      `update opportunities set stage = $3, loss_reason = case when $3 = 'perdido' then $4 else loss_reason end,
       last_activity_at = now(), updated_at = now() where id = $1 and company_id = $2 returning *`, [id, companyId, stage, lossReason || null]);
    if (!result.rowCount) throw new NotFoundException('Opportunity not found');
    await this.activity(companyId, id, actorId, 'opportunity.stage_changed', `Etapa: ${stage}`);
    return result.rows[0];
  }

  async assign(companyId: string, id: string, assigneeId: string, actorId: string) {
    const user = await this.db.query(`select id from admin_users where id = $1 and company_id = $2 and active and role in ('owner','admin')`, [assigneeId, companyId]);
    if (!user.rowCount) throw new BadRequestException('Assignee must be an active seller in this company');
    const result = await this.db.query(`update opportunities set assignee_id = $3, last_activity_at = now(), updated_at = now() where id = $1 and company_id = $2 returning *`, [id, companyId, assigneeId]);
    if (!result.rowCount) throw new NotFoundException('Opportunity not found');
    await this.activity(companyId, id, actorId, 'opportunity.assigned', 'Responsable asignado');
    return result.rows[0];
  }

  async note(companyId: string, id: string, actorId: string, content: string, nextAction?: string) {
    if (!content) throw new BadRequestException('Note content is required');
    await this.db.query(`update opportunities set next_action = coalesce($3, next_action), last_activity_at = now(), updated_at = now() where id = $1 and company_id = $2`, [id, companyId, nextAction || null]);
    await this.activity(companyId, id, actorId, 'opportunity.note', content);
    return this.detail(companyId, id);
  }

  async handoff(companyId: string, id: string, assigneeId: string, actorId: string) {
    const opportunity = await this.detail(companyId, id);
    if (opportunity.score < 60) throw new BadRequestException('Only opportunities with score 60 or higher can be handed off');
    await this.assign(companyId, id, assigneeId, actorId);
    await this.activity(companyId, id, actorId, 'opportunity.handoff', 'Lead caliente derivado a vendedor humano');
    return this.detail(companyId, id);
  }

  async createProposal(companyId: string, id: string, actorId: string) {
    const opportunity = await this.db.query<{ service_interest: string | null; score_signals: Record<string, boolean>; lead_name: string | null }>(
      `select o.service_interest, o.score_signals, l.name as lead_name from opportunities o join leads l on l.id = o.lead_id where o.id = $1 and o.company_id = $2`, [id, companyId]);
    if (!opportunity.rowCount) throw new NotFoundException('Opportunity not found');
    const item = opportunity.rows[0];
    const title = `Propuesta inicial${item.service_interest ? ` · ${item.service_interest}` : ''}`;
    const content = [`Cliente: ${item.lead_name || 'Prospecto'}.`, `Servicio de interés: ${item.service_interest || 'por definir'}.`, '', 'Objetivo y necesidad:', item.score_signals.need ? 'Necesidad comercial identificada durante la conversación.' : 'Validar necesidad en reunión de discovery.', '', 'Alcance inicial:', item.score_signals.scope ? 'Preparar alcance preliminar según lo conversado.' : 'Levantar alcance técnico y comercial.', '', 'Siguiente paso recomendado:', 'Agendar reunión de discovery para confirmar alcance, inversión, responsables y cronograma.'].join('\n');
    const result = await this.db.query(`insert into opportunity_proposals (company_id, opportunity_id, title, content, created_by) values ($1,$2,$3,$4,$5) returning *`, [companyId, id, title, content, actorId]);
    await this.changeStage(companyId, id, 'propuesta', actorId);
    await this.activity(companyId, id, actorId, 'opportunity.proposal_created', 'Borrador de propuesta generado');
    return result.rows[0];
  }

  private score(q: Record<string, string>, updatedAt: string) {
    const weights: Record<string, number> = { need: 20, scope: 15, urgency: 15, budget: 20, authority: 20 };
    const signals: Record<string, boolean> = {};
    let score = 0;
    for (const [key, value] of Object.entries(weights)) { signals[key] = Boolean(q[key]); if (signals[key]) score += value; }
    signals.recent_activity = Date.now() - new Date(updatedAt).getTime() <= 48 * 60 * 60 * 1000;
    if (signals.recent_activity) score += 10;
    return { score, signals };
  }

  private async activity(companyId: string, id: string, actorId: string, type: string, content: string) {
    await this.db.query(`insert into opportunity_activities (company_id, opportunity_id, actor_id, activity_type, content) values ($1,$2,$3,$4,$5)`, [companyId, id, actorId, type, content]);
    await this.events.record({ companyId, eventType: type, aggregateType: 'opportunity', aggregateId: id, payload: { content } });
    await this.audit.record({ companyId, actorType: 'admin_user', actorId, action: type, resourceType: 'opportunity', resourceId: id, metadata: { content } });
  }
}
