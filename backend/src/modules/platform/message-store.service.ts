import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { PlatformService } from './platform.service';

export interface StoredMessage {
  id: string; companyId: string; conversationId: string; providerMessageId?: string | null;
  direction: string; messageType: string; textBody?: string | null; rawPayload?: unknown;
  inboundEventId?: string | null; createdAt?: Date | string;
}

export interface StoredMessagePage {
  items: StoredMessage[];
  nextCursor: string | null;
}

interface PostgresMessageRow {
  id: string;
  company_id: string;
  conversation_id: string;
  provider_message_id: string | null;
  direction: string;
  message_type: string;
  text_body: string | null;
  created_at: Date;
}

@Injectable()
export class MessageStore {
  constructor(private readonly platform: PlatformService, private readonly db: DatabaseService) {}
  get mongo() { return this.platform.mongo; }

  async inboundEvent(payload: unknown): Promise<string> {
    if (this.mongo) return (await this.platform.request<{ id: string }>('POST', '/v1/inbound-events', payload)).id;
    const result = await this.db.query<{ id: string }>('insert into inbound_webhook_events(provider,payload) values($1,$2) returning id', ['meta_whatsapp', JSON.stringify(payload)]);
    return result.rows[0].id;
  }

  async save(input: Omit<StoredMessage, 'id'> & { id?: string }) {
    this.platform.assertCompany(input.companyId);
    const message = { ...input, id: input.id || randomUUID() };
    if (this.mongo) return this.platform.request<{ inserted: boolean; id: string }>('POST', '/v1/messages', message);
    const result = await this.db.query<{ id: string }>(`insert into messages(id,company_id,conversation_id,provider_message_id,direction,message_type,text_body,raw_payload,inbound_event_id,created_at)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce($10::timestamptz,now())) on conflict(provider_message_id) do nothing returning id`,
      [message.id, input.companyId, input.conversationId, input.providerMessageId, input.direction, input.messageType, input.textBody, JSON.stringify(input.rawPayload ?? null), input.inboundEventId, input.createdAt || null]);
    return { inserted: !!result.rowCount, id: result.rows[0]?.id || message.id };
  }

  async summary(companyId: string, ids: string[], direction?: string) {
    this.platform.assertCompany(companyId);
    if (!ids.length) return [];
    if (this.mongo) {
      const response = await this.platform.request<{ items: { _id: string; count: number; lastMessageAt: string }[] }>('POST', '/v1/messages/summary', { conversationIds: ids, direction });
      return response.items.map(row => ({ conversationId: row._id, count: row.count, lastMessageAt: new Date(row.lastMessageAt) }));
    }
    const result = await this.db.query<{ conversation_id: string; count: string; last_message_at: Date }>(`select conversation_id,count(*)::text as count,max(created_at) as last_message_at from messages
      where company_id=$1 and conversation_id=any($2::uuid[]) and ($3::text is null or direction=$3) group by conversation_id`, [companyId, ids, direction || null]);
    return result.rows.map(row => ({ conversationId: row.conversation_id, count: Number(row.count), lastMessageAt: new Date(row.last_message_at) }));
  }

  async list(companyId: string, conversationId: string, limit: number, cursor?: string): Promise<StoredMessagePage> {
    this.platform.assertCompany(companyId);
    const size = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 300) : 100;
    if (this.mongo) {
      const page = await this.platform.request<StoredMessagePage>('GET', `/v1/messages?${new URLSearchParams({ conversationId, limit: String(size), ...(cursor ? { cursor } : {}) })}`);
      return { ...page, items: page.items.map(item => ({ ...item, companyId })) };
    }
    const result = await this.db.query<PostgresMessageRow>(`select id,company_id,conversation_id,provider_message_id,direction,message_type,text_body,created_at from messages where company_id=$1 and conversation_id=$2 order by created_at desc,id desc limit $3`, [companyId, conversationId, size]);
    return { items: result.rows.reverse().map(row => ({ id: row.id, companyId: row.company_id,
      conversationId: row.conversation_id, providerMessageId: row.provider_message_id, direction: row.direction,
      messageType: row.message_type, textBody: row.text_body, createdAt: row.created_at })), nextCursor: null };
  }
}
