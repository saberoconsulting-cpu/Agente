import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { PlatformService } from './platform.service';

export type MessagePresentation = { sender: 'ai' | 'human' | 'contact' | 'system'; sender_name?: string; attachment?: { id: string; kind: string; filename?: string; mime_type?: string } };
export interface StoredMessage {
  id: string; companyId: string; conversationId: string; providerMessageId?: string | null;
  direction: string; messageType: string; textBody?: string | null; rawPayload?: unknown;
  inboundEventId?: string | null; createdAt?: Date | string;
  presentation?: MessagePresentation;
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
  presentation?: MessagePresentation;
  raw_payload?: any;
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
      [message.id, input.companyId, input.conversationId, input.providerMessageId, input.direction, input.messageType, input.textBody, JSON.stringify({ provider: input.rawPayload ?? null, _sabero: input.presentation }), input.inboundEventId, input.createdAt || null]);
    return { inserted: !!result.rowCount, id: result.rows[0]?.id || message.id };
  }

  async summary(companyId: string, ids: string[], direction?: string) {
    this.platform.assertCompany(companyId);
    if (!ids.length) return [];
    if (this.mongo) {
      const response = await this.platform.request<{ items: { _id: string; count: number; lastMessageAt: string; firstMessageAt?: string; preview?: string; lastInboundAt?: string;lastDirection?:string }[] }>('POST', '/v1/messages/summary', { conversationIds: ids, direction });
      return response.items.map(row => ({ conversationId: row._id, count: Number(row.count), lastMessageAt: new Date(row.lastMessageAt), firstMessageAt: row.firstMessageAt ? new Date(row.firstMessageAt) : undefined, preview: row.preview, lastInboundAt: row.lastInboundAt ? new Date(row.lastInboundAt) : undefined,lastDirection:row.lastDirection }));
    }
    const result = await this.db.query<{ conversation_id: string; count: string; last_message_at: Date; first_message_at: Date; preview: string; last_inbound_at: Date;last_direction:string }>(`select conversation_id,count(*)::text as count,max(created_at) as last_message_at,min(created_at) as first_message_at,
      (array_agg(direction order by created_at desc,id desc))[1] as last_direction,(array_agg(text_body order by created_at desc,id desc))[1] as preview,max(created_at) filter(where direction='inbound') as last_inbound_at from messages
      where company_id=$1 and conversation_id=any($2::uuid[]) and ($3::text is null or direction=$3) group by conversation_id`, [companyId, ids, direction || null]);
    return result.rows.map(row => ({ conversationId: row.conversation_id, count: Number(row.count), lastMessageAt: new Date(row.last_message_at), firstMessageAt: new Date(row.first_message_at), preview: row.preview, lastInboundAt: row.last_inbound_at ? new Date(row.last_inbound_at) : undefined,lastDirection:row.last_direction }));
  }

  async list(companyId: string, conversationId: string, limit: number, cursor?: string): Promise<StoredMessagePage> {
    this.platform.assertCompany(companyId);
    const size = Number.isFinite(limit) ? Math.min(Math.max(Math.floor(limit), 1), 300) : 100;
    if (this.mongo) {
      const page = await this.platform.request<StoredMessagePage>('GET', `/v1/messages?${new URLSearchParams({ conversationId, limit: String(size), ...(cursor ? { cursor } : {}) })}`);
      return { ...page, items: page.items.map(item => ({ ...item, companyId })) };
    }
    let before: { createdAt: string; id: string } | null = null;
    if (cursor) {
      try { before = JSON.parse(Buffer.from(cursor, 'base64url').toString()); } catch { throw new BadRequestException('Cursor inválido'); }
      if (!before || !Number.isFinite(Date.parse(before.createdAt)) || !/^[a-f0-9-]{36}$/i.test(before.id)) throw new BadRequestException('Cursor inválido');
    }
    const result = await this.db.query<PostgresMessageRow>(`select id,company_id,conversation_id,provider_message_id,direction,message_type,text_body,created_at,raw_payload,raw_payload->'_sabero' as presentation from messages
      where company_id=$1 and conversation_id=$2 and ($4::timestamptz is null or (created_at,id)<($4::timestamptz,$5::uuid)) order by created_at desc,id desc limit $3`, [companyId, conversationId, size + 1, before?.createdAt || null, before?.id || null]);
    const rows = result.rows.slice(0, size);
    const last = rows[rows.length - 1];
    const nextCursor = result.rows.length > size && last ? Buffer.from(JSON.stringify({ createdAt: last.created_at, id: last.id })).toString('base64url') : null;
    return { items: rows.reverse().map(row => ({ id: row.id, companyId: row.company_id,
      conversationId: row.conversation_id, providerMessageId: row.provider_message_id, direction: row.direction,
      messageType: row.message_type, textBody: row.text_body, createdAt: row.created_at, presentation: row.presentation || this.legacyPresentation(row.raw_payload,row.direction) })), nextCursor };
  }

  private legacyPresentation(raw:any,direction:string):MessagePresentation|undefined{
    const original=raw?.provider||raw;
    for(const kind of ['document','image','audio','video'])if(original?.[kind]?.id)return {sender:direction==='inbound'?'contact':'ai',attachment:{id:original[kind].id,kind,filename:original[kind].filename,mime_type:original[kind].mime_type}};
    return undefined;
  }

  async attachment(companyId: string, conversationId: string, messageId: string) {
    this.platform.assertCompany(companyId);
    if (this.mongo) return (await this.platform.request<{attachment: MessagePresentation['attachment'] | null}>('GET',`/v1/message-attachment?${new URLSearchParams({conversationId,messageId})}`)).attachment;
    const result=await this.db.query('select raw_payload from messages where company_id=$1 and conversation_id=$2 and id=$3',[companyId,conversationId,messageId]);
    const raw=result.rows[0]?.raw_payload;
    const known=raw?._sabero?.attachment;
    if(known)return known as NonNullable<MessagePresentation['attachment']>;
    const original=raw?.provider||raw;
    for(const kind of ['document','image','audio','video'])if(original?.[kind]?.id)return {id:original[kind].id,kind,filename:original[kind].filename,mime_type:original[kind].mime_type};
    return null;
  }
}
