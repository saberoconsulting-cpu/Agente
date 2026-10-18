import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly db: DatabaseService) {}

  async list(companyId: string, limit = 50) {
    const result = await this.db.query(
      `select
         c.id,
         c.company_id,
         c.lead_id,
         c.channel,
         c.external_id,
         c.state,
         c.created_at,
         c.updated_at,
         l.name as lead_name,
         l.whatsapp_number,
         count(m.id)::int as messages_count,
         max(m.created_at) as last_message_at
       from conversations c
       left join leads l on l.id = c.lead_id
       left join messages m on m.conversation_id = c.id
       where c.company_id = $1
       group by c.id, l.name, l.whatsapp_number
       order by coalesce(max(m.created_at), c.updated_at) desc
       limit $2`,
      [companyId, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows;
  }

  async messages(companyId: string, conversationId: string, limit = 100) {
    const result = await this.db.query(
      `select
         m.id,
         m.company_id,
         m.conversation_id,
         m.provider_message_id,
         m.direction,
         m.message_type,
         m.text_body,
         m.created_at
       from messages m
       join conversations c on c.id = m.conversation_id
       where m.company_id = $1 and c.id = $2
       order by m.created_at asc
       limit $3`,
      [companyId, conversationId, Math.min(Math.max(limit, 1), 300)],
    );
    return result.rows;
  }
}
