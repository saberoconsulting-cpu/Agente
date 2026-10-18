import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { SalesAgentService } from '../sales-agent/sales-agent.service';
import { WhatsappConnectionsService } from './whatsapp-connections.service';

type WhatsappMessage = {
  id: string;
  from: string;
  phoneNumberId?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
};

@Injectable()
export class WhatsappService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
    private readonly salesAgent: SalesAgentService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
    private readonly connections: WhatsappConnectionsService,
  ) {}

  verifyWebhook(mode: string, verifyToken: string, challenge: string) {
    const expected = this.config.get<string>('META_WEBHOOK_VERIFY_TOKEN')
      || this.config.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && verifyToken === expected) {
      return challenge;
    }

    throw new ForbiddenException('Invalid webhook verification token');
  }

  async receiveWebhook(body: unknown, rawBody?: Buffer, signature?: string) {
    this.validateSignature(rawBody, signature);

    const eventId = await this.saveInboundEvent(body);
    const messages = this.extractMessages(body);

    for (const message of messages) {
      const saved = await this.upsertInboundMessage(eventId, message);
      if (saved.inserted) {
        void this.processInboundMessage(message, saved).catch((error) => {
          console.error('Failed to process WhatsApp message', {
            message_id: message.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }
    }
  }

  async sendWhatsAppText(to: string, text: string, companyId?: string) {
    return this.sendText(to, text, companyId);
  }

  private async processInboundMessage(
    message: WhatsappMessage,
    saved: { conversationId: string; leadId: string },
  ) {
    const companyId = await this.resolveCompanyId(message.phoneNumberId);
    const inboundText = message.text?.body?.trim();

    if (!inboundText) {
      await this.sendText(
        message.from,
        'Hola, soy el asistente virtual de SABERO Consulting. Por ahora puedo ayudarte mejor si me envias tu consulta en texto.',
        companyId,
      );
      return;
    }

    if (this.isOptOut(inboundText)) {
      await this.registerOptOut(companyId, message.from, inboundText);
      await this.sendText(
        message.from,
        'Entendido. No te enviaremos mas mensajes de seguimiento por WhatsApp. Si deseas retomar la conversacion, puedes escribirnos nuevamente.',
        companyId,
      );
      return;
    }

    const response = await this.salesAgent.respondToMessage({
      companyId,
      message: inboundText,
      conversationId: saved.conversationId,
      leadId: saved.leadId,
    });

    await this.sendText(message.from, response.answer, companyId);
  }

  private validateSignature(rawBody?: Buffer, signature?: string) {
    const required = this.config.get<string>('WEBHOOK_SIGNATURE_REQUIRED') === 'true';
    const appSecret = this.config.get<string>('META_APP_SECRET');

    if (!required) return;
    if (!rawBody || !signature || !appSecret) {
      throw new ForbiddenException('Missing Meta signature data');
    }

    const expected = `sha256=${createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')}`;

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new ForbiddenException('Invalid Meta signature');
    }
  }

  private async saveInboundEvent(payload: unknown): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `insert into inbound_webhook_events (provider, payload)
       values ($1, $2)
       returning id`,
      ['meta_whatsapp', JSON.stringify(payload)],
    );
    return result.rows[0].id;
  }

  private extractMessages(payload: unknown): WhatsappMessage[] {
    if (!payload || typeof payload !== 'object') return [];

    const entries = (payload as { entry?: unknown[] }).entry || [];
    const messages: WhatsappMessage[] = [];

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] }).changes || [];
      for (const change of changes) {
        const value = (change as {
          value?: {
            messages?: WhatsappMessage[];
            metadata?: { phone_number_id?: string };
          };
        }).value;
        for (const message of value?.messages || []) {
          if (message.id && message.from) {
            messages.push({
              ...message,
              phoneNumberId: value?.metadata?.phone_number_id,
            });
          }
        }
      }
    }

    return messages;
  }

  private async upsertInboundMessage(
    eventId: string,
    message: WhatsappMessage,
  ): Promise<{ inserted: boolean; conversationId: string; leadId: string }> {
    const text = message.text?.body || null;
    const companyId = await this.resolveCompanyId(message.phoneNumberId);

    const leadResult = await this.db.query<{ id: string }>(
      `insert into leads (company_id, whatsapp_number)
       values ($1, $2)
       on conflict (company_id, whatsapp_number)
       do update set updated_at = now()
       returning id`,
      [companyId, message.from],
    );

    const conversation = await this.db.query<{ id: string }>(
      `insert into conversations (company_id, lead_id, channel, external_id)
       select $1, $3::uuid, 'whatsapp', $2
       from leads l
       where l.company_id = $1 and l.whatsapp_number = $2
       on conflict (company_id, channel, external_id)
       do update set updated_at = now()
       returning id`,
      [companyId, message.from, leadResult.rows[0].id],
    );

    const insertResult = await this.db.query<{ id: string }>(
      `insert into messages (
         company_id, conversation_id, provider_message_id, direction, message_type, text_body, raw_payload, inbound_event_id
       )
       values ($1, $2, $3, 'inbound', $4, $5, $6, $7)
       on conflict (provider_message_id) do nothing
       returning id`,
      [
        companyId,
        conversation.rows[0].id,
        message.id,
        message.type || 'unknown',
        text,
        JSON.stringify(message),
        eventId,
      ],
    );

    if (insertResult.rowCount) {
      await this.events.record({
        companyId,
        eventType: 'message.received',
        aggregateType: 'conversation',
        aggregateId: conversation.rows[0].id,
        payload: {
          lead_id: leadResult.rows[0].id,
          channel: 'whatsapp',
          provider_message_id: message.id,
        },
      });
    }

    return {
      inserted: Boolean(insertResult.rowCount),
      conversationId: conversation.rows[0].id,
      leadId: leadResult.rows[0].id,
    };
  }

  private async sendText(to: string, text: string, companyId?: string) {
    const credentials = await this.resolveSendCredentials(companyId);
    const token = credentials.token;
    const phoneNumberId = credentials.phoneNumberId;
    const version = this.config.get<string>('META_GRAPH_API_VERSION') || 'v25.0';

    if (!token || !phoneNumberId) {
      throw new BadRequestException('WhatsApp token and phone number id are required');
    }

    const response = await axios.post(
      `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );

    const providerMessageId = response.data?.messages?.[0]?.id || null;
    const outboundCompanyId = companyId || this.config.get<string>('COMPANY_ID') || 'sabero';

    await this.db.query(
      `insert into outbound_messages (company_id, recipient, text_body, provider_message_id, raw_response)
       values ($1, $2, $3, $4, $5)`,
      [outboundCompanyId, to, text, providerMessageId, JSON.stringify(response.data)],
    );

    await this.events.record({
      companyId: outboundCompanyId,
      eventType: 'message.sent',
      aggregateType: 'whatsapp',
      aggregateId: providerMessageId || undefined,
      payload: { recipient: to },
    });
  }

  private isOptOut(text: string) {
    return /\b(stop|baja|cancelar|no escribir|no me escriban|salir|unsubscribe)\b/i.test(text);
  }

  private async registerOptOut(companyId: string, recipient: string, reason: string) {
    await this.db.query(
      `insert into opt_outs (company_id, channel, recipient, reason)
       values ($1, 'whatsapp', $2, $3)
       on conflict (company_id, channel, recipient)
       do update set opted_out_at = now(), reason = excluded.reason`,
      [companyId, recipient, reason],
    );
    await this.audit.record({
      companyId,
      action: 'recipient.opted_out',
      resourceType: 'whatsapp_recipient',
      resourceId: recipient,
      metadata: { reason },
    });
  }

  private async resolveCompanyId(phoneNumberId?: string) {
    if (phoneNumberId) {
      const connection = await this.connections.findActiveByPhoneNumberId(phoneNumberId);
      if (connection) return connection.company_id;
    }

    return this.config.get<string>('COMPANY_ID') || 'sabero';
  }

  private async resolveSendCredentials(companyId?: string) {
    if (companyId) {
      const connection = await this.connections.findActiveForCompany(companyId);
      if (connection) {
        return {
          token: this.connections.decryptAccessToken(connection),
          phoneNumberId: connection.phone_number_id,
        };
      }
    }

    return {
      token: this.config.get<string>('META_ACCESS_TOKEN')
        || this.config.get<string>('WHATSAPP_TOKEN'),
      phoneNumberId: this.config.get<string>('META_PHONE_NUMBER_ID')
        || this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
    };
  }
}
