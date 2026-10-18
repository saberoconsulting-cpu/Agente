import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { EventsService } from '../events/events.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

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
};

@Injectable()
export class FollowupsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly whatsapp: WhatsappService,
    private readonly events: EventsService,
  ) {}

  async schedule(input: ScheduleFollowupInput) {
    const companyId = input.company_id || 'sabero';
    if (!input.recipient || !input.message || !input.scheduled_at) {
      throw new BadRequestException('recipient, message and scheduled_at are required');
    }

    await this.ensureCanSchedule(companyId, input.recipient);

    const maxFollowups = Number(this.config.get<string>('MAX_FOLLOWUPS_PER_LEAD') || 3);
    const count = await this.db.query<{ count: string }>(
      `select count(*)::text
       from followups
       where company_id = $1 and recipient = $2 and status in ('scheduled', 'sent')`,
      [companyId, input.recipient],
    );

    if (Number(count.rows[0].count) >= maxFollowups) {
      throw new BadRequestException('Maximum followups reached for this recipient');
    }

    const result = await this.db.query(
      `insert into followups (
         company_id, lead_id, conversation_id, recipient, message, template_name,
         scheduled_at, reason, idempotency_key
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (company_id, idempotency_key)
       do update set updated_at = now()
       returning *`,
      [
        companyId,
        input.lead_id || null,
        input.conversation_id || null,
        input.recipient,
        input.message,
        input.template_name || null,
        input.scheduled_at,
        input.reason || null,
        input.idempotency_key || null,
      ],
    );

    const followup = result.rows[0];
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

    return followup;
  }

  async processDue(companyId: string, limit: number) {
    const due = await this.db.query(
      `select *
       from followups
       where company_id = $1 and status = 'scheduled' and scheduled_at <= now()
       order by scheduled_at asc
       limit $2`,
      [companyId, limit],
    );

    const results = [];
    for (const followup of due.rows) {
      try {
        await this.ensureCanSend(companyId, followup.recipient, followup.template_name);
        await this.whatsapp.sendWhatsAppText(followup.recipient, followup.message, companyId);
        await this.db.query(
          `update followups set status = 'sent', sent_at = now(), updated_at = now() where id = $1`,
          [followup.id],
        );
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
        await this.db.query(
          `update followups set status = 'blocked', reason = $2, updated_at = now() where id = $1`,
          [followup.id, message],
        );
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
    const optOut = await this.db.query(
      `select id from opt_outs where company_id = $1 and channel = 'whatsapp' and recipient = $2`,
      [companyId, recipient],
    );
    if (optOut.rowCount) throw new BadRequestException('Recipient opted out');
  }

  private async ensureCanSend(companyId: string, recipient: string, templateName?: string | null) {
    await this.ensureCanSchedule(companyId, recipient);

    const window = await this.db.query<{ last_inbound_at: string }>(
      `select max(created_at)::text as last_inbound_at
       from messages m
       join conversations c on c.id = m.conversation_id
       where m.company_id = $1
         and c.external_id = $2
         and m.direction = 'inbound'`,
      [companyId, recipient],
    );

    const lastInbound = window.rows[0]?.last_inbound_at
      ? new Date(window.rows[0].last_inbound_at)
      : null;
    const inside24h = lastInbound
      ? Date.now() - lastInbound.getTime() <= 24 * 60 * 60 * 1000
      : false;

    if (!inside24h && !templateName) {
      throw new BadRequestException('Outside WhatsApp 24h window; approved template is required');
    }
  }
}
