import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toDatabaseShape } from '../../infrastructure/prisma/serialize';
import { EventsService } from '../events/events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { QueueService } from '../queue/queue.service';
import { AuditService } from '../audit/audit.service';

export type ScheduleFollowupInput = {
  company_id?: string;
  lead_id?: string;
  conversation_id?: string;
  recipient: string;
  message: string;
  scheduled_at: string;
  template_name?: string;
  reason?: string;
  idempotency_key?: string;
  opportunity_followup_draft_id?: string;
};

@Injectable()
export class FollowupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
    private readonly events: EventsService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

  async schedule(input: ScheduleFollowupInput) {
    const companyId = input.company_id || 'sabero';
    if (!input.recipient || !input.message || !input.scheduled_at) {
      throw new BadRequestException('recipient, message and scheduled_at are required');
    }

    await this.ensureCanSchedule(companyId, input.recipient);

    const maxFollowups = Number(this.config.get<string>('MAX_FOLLOWUPS_PER_LEAD') || 3);
    const count = await this.prisma.followup.count({ where: { companyId, recipient: input.recipient, status: { in: ['scheduled', 'sent'] } } });

    if (count >= maxFollowups) {
      throw new BadRequestException('Maximum followups reached for this recipient');
    }

    const data = { companyId, leadId: input.lead_id || null, conversationId: input.conversation_id || null, recipient: input.recipient, message: input.message, templateName: input.template_name || null, scheduledAt: new Date(input.scheduled_at), reason: input.reason || null, idempotencyKey: input.idempotency_key || null, opportunityFollowupDraftId: input.opportunity_followup_draft_id || null };
    const followup = input.idempotency_key
      ? await this.prisma.followup.upsert({ where: { companyId_idempotencyKey: { companyId, idempotencyKey: input.idempotency_key } }, create: data, update: { updatedAt: new Date() } })
      : await this.prisma.followup.create({ data });
    await this.events.record({
      companyId,
      eventType: 'followup.scheduled',
      aggregateType: 'followup',
      aggregateId: followup.id,
      payload: {
        lead_id: input.lead_id || null,
        conversation_id: input.conversation_id || null,
        recipient: input.recipient,
        scheduled_at: input.scheduled_at,
      },
    });
    await this.queue.enqueue('followup.process', companyId, {}, new Date(input.scheduled_at));

    return toDatabaseShape(followup);
  }

  async processDue(companyId: string, limit: number) {
    const due = await this.prisma.followup.findMany({ where: { companyId, status: 'scheduled', scheduledAt: { lte: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: Math.min(Math.max(limit, 1), 100) });

    const results = [];
    for (const followup of due) {
      try {
        await this.ensureCanSend(companyId, followup.recipient, followup.templateName);
        await this.whatsapp.sendWhatsAppText(followup.recipient, followup.message, companyId);
        await this.prisma.followup.update({ where: { id: followup.id }, data: { status: 'sent', sentAt: new Date(), updatedAt: new Date() } });
        await this.prisma.opportunityFollowupDraft.updateMany({ where: { followupId: followup.id, status: 'approved' }, data: { status: 'sent', updatedAt: new Date() } });
        if (followup.opportunityFollowupDraftId) await this.audit.record({ companyId, action: 'opportunity.followup_draft_sent', resourceType: 'opportunity_followup_draft', resourceId: followup.opportunityFollowupDraftId });
        await this.events.record({
          companyId,
          eventType: 'followup.sent',
          aggregateType: 'followup',
          aggregateId: followup.id,
          payload: { recipient: followup.recipient },
        });
        results.push({ id: followup.id, status: 'sent' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.followup.update({ where: { id: followup.id }, data: { status: 'blocked', reason: message, updatedAt: new Date() } });
        await this.prisma.opportunityFollowupDraft.updateMany({ where: { followupId: followup.id, status: 'approved' }, data: { status: 'blocked', rejectionReason: message, updatedAt: new Date() } });
        if (followup.opportunityFollowupDraftId) await this.audit.record({ companyId, action: 'opportunity.followup_draft_blocked', resourceType: 'opportunity_followup_draft', resourceId: followup.opportunityFollowupDraftId, metadata: { reason: message } });
        await this.events.record({
          companyId,
          eventType: 'followup.blocked',
          aggregateType: 'followup',
          aggregateId: followup.id,
          payload: { recipient: followup.recipient, reason: message },
        });
        results.push({ id: followup.id, status: 'blocked', reason: message });
      }
    }

    return { processed: results.length, results };
  }

  private async ensureCanSchedule(companyId: string, recipient: string) {
    const optOut = await this.prisma.optOut.findFirst({ where: { companyId, channel: 'whatsapp', recipient } });
    if (optOut) throw new BadRequestException('Recipient opted out');
  }

  private async ensureCanSend(companyId: string, recipient: string, templateName?: string | null) {
    await this.ensureCanSchedule(companyId, recipient);

    const conversations = await this.prisma.conversation.findMany({ where: { companyId, externalId: recipient }, select: { id: true } });
    const window = conversations.length ? await this.prisma.message.aggregate({ where: { companyId, direction: 'inbound', conversationId: { in: conversations.map((item) => item.id) } }, _max: { createdAt: true } }) : null;
    const lastInbound = window?._max.createdAt || null;
    const inside24h = lastInbound
      ? Date.now() - lastInbound.getTime() <= 24 * 60 * 60 * 1000
      : false;

    if (!inside24h && !templateName) {
      throw new BadRequestException('Outside WhatsApp 24h window; approved template is required');
    }
  }
}
