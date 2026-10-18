import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

export type AgentEventInput = {
  companyId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  payload?: Record<string, unknown>;
};

@Injectable()
export class EventsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async record(input: AgentEventInput) {
    const result = await this.db.query<{ id: string }>(
      `insert into agent_events (
         company_id, event_type, aggregate_type, aggregate_id, payload
       )
       values ($1, $2, $3, $4, $5)
       returning id`,
      [
        input.companyId,
        input.eventType,
        input.aggregateType || null,
        input.aggregateId || null,
        JSON.stringify(input.payload || {}),
      ],
    );

    const eventId = result.rows[0].id;
    void this.deliverWebhook(eventId, input).catch((error) => {
      console.warn('Outbound webhook delivery failed', {
        event_id: eventId,
        event_type: input.eventType,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return { id: eventId, ...input };
  }

  async list(companyId: string, limit = 50) {
    const result = await this.db.query(
      `select id, company_id, event_type, aggregate_type, aggregate_id, payload, created_at
       from agent_events
       where company_id = $1
       order by created_at desc
       limit $2`,
      [companyId, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows;
  }

  private async deliverWebhook(eventId: string, input: AgentEventInput) {
    const url = this.config.get<string>('OUTBOUND_WEBHOOK_URL');
    if (!url) return;

    const payload = {
      id: eventId,
      company_id: input.companyId,
      event_type: input.eventType,
      aggregate_type: input.aggregateType || null,
      aggregate_id: input.aggregateId || null,
      payload: input.payload || {},
      created_at: new Date().toISOString(),
    };
    const rawPayload = JSON.stringify(payload);
    const secret = this.config.get<string>('OUTBOUND_WEBHOOK_SECRET') || '';
    const signature = secret
      ? createHmac('sha256', secret).update(rawPayload).digest('hex')
      : null;

    const delivery = await this.db.query<{ id: string }>(
      `insert into outbound_webhook_deliveries (
         company_id, event_id, target_url, status, request_payload
       )
       values ($1, $2, $3, 'pending', $4)
       returning id`,
      [input.companyId, eventId, url, rawPayload],
    );

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(signature ? { 'X-SABERO-Signature': `sha256=${signature}` } : {}),
        },
        timeout: 10000,
      });

      await this.db.query(
        `update outbound_webhook_deliveries
         set status = 'delivered',
             status_code = $2,
             response_body = $3,
             delivered_at = now()
         where id = $1`,
        [delivery.rows[0].id, response.status, JSON.stringify(response.data || {})],
      );
    } catch (error) {
      await this.db.query(
        `update outbound_webhook_deliveries
         set status = 'failed',
             error_message = $2
         where id = $1`,
        [delivery.rows[0].id, error instanceof Error ? error.message : String(error)],
      );
      throw error;
    }
  }
}
