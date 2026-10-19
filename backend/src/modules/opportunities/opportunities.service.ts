import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { FollowupsService } from '../followups/followups.service';
import { QueueService } from '../queue/queue.service';
import { OpportunitiesRepository } from './repositories/opportunities.repository';

const stages = ['nuevo', 'calificado', 'reunion_propuesta', 'reunion_agendada', 'propuesta', 'ganado', 'perdido'];
const closedStages = ['ganado', 'perdido'];

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly repository: OpportunitiesRepository,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly followups: FollowupsService,
    private readonly queue: QueueService,
  ) {}

  async list(companyId: string, filters: { stage?: string; assignee_id?: string; min_score?: number } = {}) {
    const result = await this.repository.list(companyId, filters.stage, filters.assignee_id, filters.min_score);
    return result.rows;
  }

  async detail(companyId: string, id: string) {
    const opportunity = await this.repository.find(companyId, id);
    if (!opportunity.rowCount) throw new NotFoundException('Opportunity not found');
    const activities = await this.repository.activities(id);
    const proposals = await this.repository.proposals(companyId, id);
    return { ...opportunity.rows[0], activities: activities.rows, proposals: proposals.rows };
  }

  async create(companyId: string, actorId: string, input: { lead_id: string; conversation_id?: string; service_interest?: string }) {
    const lead = await this.repository.leadForScoring(companyId, input.lead_id);
    if (!lead.rowCount) throw new NotFoundException('Lead not found');
    const scored = this.score(lead.rows[0].qualification || {}, lead.rows[0].updated_at);
    const result = await this.repository.create(companyId, input.lead_id, input.conversation_id, scored.score, scored.signals, input.service_interest);
    await this.activity(companyId, result.rows[0].id, actorId, 'opportunity.created', 'Oportunidad creada');
    return result.rows[0];
  }

  async confirm(companyId: string, id: string, actorId: string) { return this.changeStage(companyId, id, 'calificado', actorId); }

  async changeStage(companyId: string, id: string, stage: string, actorId: string, lossReason?: string) {
    if (!stages.includes(stage)) throw new BadRequestException('Invalid opportunity stage');
    const result = await this.repository.updateStage(companyId, id, stage, lossReason);
    if (!result.rowCount) throw new NotFoundException('Opportunity not found');
    await this.activity(companyId, id, actorId, 'opportunity.stage_changed', `Etapa: ${stage}`);
    return result.rows[0];
  }

  async assign(companyId: string, id: string, assigneeId: string, actorId: string) {
    const user = await this.repository.activeSeller(companyId, assigneeId);
    if (!user.rowCount) throw new BadRequestException('Assignee must be an active seller in this company');
    const result = await this.repository.assign(companyId, id, assigneeId);
    if (!result.rowCount) throw new NotFoundException('Opportunity not found');
    await this.activity(companyId, id, actorId, 'opportunity.assigned', 'Responsable asignado');
    return result.rows[0];
  }

  async note(companyId: string, id: string, actorId: string, content: string, nextAction?: string) {
    if (!content) throw new BadRequestException('Note content is required');
    await this.repository.updateNote(companyId, id, nextAction);
    await this.activity(companyId, id, actorId, 'opportunity.note', content);
    return this.detail(companyId, id);
  }

  async handoff(companyId: string, id: string, assigneeId: string, actorId: string) {
    const opportunity = await this.detail(companyId, id);
    if ((opportunity as { score?: number }).score! < 60) throw new BadRequestException('Only opportunities with score 60 or higher can be handed off');
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

  async listFollowupDrafts(companyId: string, status?: string) {
    const allowed = ['pending', 'approved', 'rejected', 'sent', 'blocked'];
    if (status && !allowed.includes(status)) throw new BadRequestException('Invalid draft status');
    const result = await this.db.query(
      `select d.*, o.stage, o.score, l.name as lead_name, l.whatsapp_number, u.email as assignee_email
       from opportunity_followup_drafts d
       join opportunities o on o.id = d.opportunity_id and o.company_id = d.company_id
       join leads l on l.id = o.lead_id
       left join admin_users u on u.id = o.assignee_id
       where d.company_id = $1 and ($2::text is null or d.status = $2)
       order by case d.priority when 'high' then 0 else 1 end, d.created_at desc
       limit 100`,
      [companyId, status || null],
    );
    return result.rows;
  }

  async approveFollowupDraft(companyId: string, id: string, actorId: string, input: { message?: string; template_name?: string }) {
    const draft = await this.db.query<{ id: string; opportunity_id: string; lead_id: string; conversation_id: string | null; whatsapp_number: string; message: string; template_name: string | null }>(
      `select d.id, d.opportunity_id, o.lead_id, o.conversation_id, l.whatsapp_number, d.message, d.template_name
       from opportunity_followup_drafts d join opportunities o on o.id = d.opportunity_id
       join leads l on l.id = o.lead_id
       where d.id = $1 and d.company_id = $2 and d.status = 'pending'`, [id, companyId]);
    if (!draft.rowCount) throw new BadRequestException('Draft is not pending or does not exist');
    const message = (input.message || draft.rows[0].message).trim();
    if (!message || message.length > 2000) throw new BadRequestException('Message must contain between 1 and 2000 characters');
    const claimed = await this.db.query(
      `update opportunity_followup_drafts set status = 'approved', message = $3, template_name = $4,
       reviewed_by = $5, reviewed_at = now(), updated_at = now()
       where id = $1 and company_id = $2 and status = 'pending' returning *`,
      [id, companyId, message, input.template_name?.trim() || draft.rows[0].template_name, actorId],
    );
    if (!claimed.rowCount) throw new BadRequestException('Draft was already resolved');
    try {
      const followup = await this.followups.schedule({
        company_id: companyId,
        lead_id: draft.rows[0].lead_id,
        conversation_id: draft.rows[0].conversation_id || undefined,
        recipient: draft.rows[0].whatsapp_number,
        message,
        template_name: input.template_name?.trim() || draft.rows[0].template_name || undefined,
        scheduled_at: new Date().toISOString(),
        reason: 'Approved opportunity follow-up draft',
        idempotency_key: `opportunity-draft:${id}`,
        opportunity_followup_draft_id: id,
      });
      await this.db.query(`update opportunity_followup_drafts set followup_id = $3, updated_at = now() where id = $1 and company_id = $2`, [id, companyId, followup.id]);
      await this.activity(companyId, draft.rows[0].opportunity_id, actorId, 'opportunity.followup_draft_approved', 'Borrador de seguimiento aprobado');
      return followup;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.db.query(`update opportunity_followup_drafts set status = 'blocked', rejection_reason = $3, updated_at = now() where id = $1 and company_id = $2`, [id, companyId, reason.slice(0, 1000)]);
      await this.activity(companyId, draft.rows[0].opportunity_id, actorId, 'opportunity.followup_draft_blocked', reason.slice(0, 1000));
      throw error;
    }
  }

  async rejectFollowupDraft(companyId: string, id: string, actorId: string, reason?: string) {
    const result = await this.db.query<{ opportunity_id: string }>(
      `update opportunity_followup_drafts set status = 'rejected', rejection_reason = $3, reviewed_by = $4,
       reviewed_at = now(), updated_at = now() where id = $1 and company_id = $2 and status = 'pending' returning opportunity_id`,
      [id, companyId, reason?.trim().slice(0, 1000) || 'Descartado por el equipo comercial', actorId],
    );
    if (!result.rowCount) throw new BadRequestException('Draft is not pending or does not exist');
    await this.activity(companyId, result.rows[0].opportunity_id, actorId, 'opportunity.followup_draft_rejected', 'Borrador de seguimiento descartado');
    return { id, status: 'rejected' };
  }

  async reviewFollowupDrafts(companyId: string) {
    const rules = [
      { key: 'proposal_stale', priority: 'high', where: `o.stage = 'propuesta' and o.last_activity_at <= now() - interval '72 hours'`, message: `Hola {name}, quería retomar la propuesta${'{service}'}. ¿Pudiste revisarla? Estoy disponible para resolver cualquier duda.` },
      { key: 'meeting_proposal_stale', priority: 'normal', where: `o.stage = 'reunion_propuesta' and o.last_activity_at <= now() - interval '24 hours'`, message: `Hola {name}, quería saber si te viene bien que coordinemos una reunión breve para revisar tu necesidad${'{service}'}.` },
      { key: 'meeting_upcoming', priority: 'high', where: `o.stage = 'reunion_agendada' and exists (select 1 from meetings m where m.company_id = o.company_id and m.lead_id = o.lead_id and m.status = 'booked' and m.start_time between now() and now() + interval '24 hours')`, message: `Hola {name}, te recordamos nuestra reunión próxima${'{service}'}. Si necesitas reprogramarla, avísanos por este medio.` },
      { key: 'opportunity_inactive', priority: 'normal', where: `o.stage not in ('ganado', 'perdido') and o.last_activity_at <= now() - interval '48 hours'`, message: `Hola {name}, quería retomar nuestra conversación${'{service}'}. ¿Hay algún punto en el que podamos ayudarte?` },
    ];
    let created = 0;
    for (const rule of rules) {
      const result = await this.db.query<{ id: string; opportunity_id: string }>(
        `insert into opportunity_followup_drafts (company_id, opportunity_id, rule_key, priority, message)
         select o.company_id, o.id, $2, $3,
           replace(replace($4, '{name}', coalesce(l.name, '')), '{service}', case when o.service_interest is null then '' else ' sobre ' || o.service_interest end)
         from opportunities o join leads l on l.id = o.lead_id
         where o.company_id = $1 and ${rule.where}
           and not exists (
             select 1 from opportunity_followup_drafts d where d.opportunity_id = o.id and d.rule_key = $2
             and (d.status = 'pending' or d.updated_at > now() - interval '7 days')
           ) returning id, opportunity_id`,
        [companyId, rule.key, rule.priority, rule.message],
      );
      created += result.rowCount || 0;
      for (const draft of result.rows) await this.activity(companyId, draft.opportunity_id, undefined, 'opportunity.followup_draft_created', `Borrador creado: ${rule.key}`);
    }
    return { created };
  }

  async enqueueReviewAllCompanies() {
    const companies = await this.repository.companies();
    const bucket = Math.floor(Date.now() / (15 * 60 * 1000));
    await Promise.all(companies.rows.map((company) => this.queue.enqueue('opportunity.review', company.id, {}, new Date(), `opportunity-review:${bucket}`)));
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

  private async activity(companyId: string, id: string, actorId: string | undefined, type: string, content: string) {
    await this.repository.recordActivity(companyId, id, actorId, type, content);
    await this.events.record({ companyId, eventType: type, aggregateType: 'opportunity', aggregateId: id, payload: { content } });
    await this.audit.record({ companyId, actorType: actorId ? 'admin_user' : 'system', actorId, action: type, resourceType: 'opportunity', resourceId: id, metadata: { content } });
  }
}
