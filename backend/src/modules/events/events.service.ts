import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import axios from 'axios';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toDatabaseShape } from '../../infrastructure/prisma/serialize';

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
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async record(input: AgentEventInput) {
    const event = await this.prisma.agentEvent.create({ data: { companyId: input.companyId, eventType: input.eventType, aggregateType: input.aggregateType || null, aggregateId: input.aggregateId || null, payload: (input.payload || {}) as Prisma.InputJsonValue } });
    const eventId = event.id;
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
    return toDatabaseShape(await this.prisma.agentEvent.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200) }));
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

    const delivery = await this.prisma.outboundWebhookDelivery.create({ data: { companyId: input.companyId, eventId, targetUrl: url, status: 'pending', requestPayload: payload as Prisma.InputJsonValue } });

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(signature ? { 'X-SABERO-Signature': `sha256=${signature}` } : {}),
        },
        timeout: 10000,
      });

      await this.prisma.outboundWebhookDelivery.update({ where: { id: delivery.id }, data: { status: 'delivered', statusCode: response.status, responseBody: response.data || {}, deliveredAt: new Date() } });
    } catch (error) {
      await this.prisma.outboundWebhookDelivery.update({ where: { id: delivery.id }, data: { status: 'failed', errorMessage: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }
}
