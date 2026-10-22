import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MessageStore } from '../../platform/message-store.service';

@Injectable()
export class LeadsRepository {
  constructor(private readonly db: DatabaseService, private readonly messages: MessageStore) {}

  async list(companyId: string, limit: number) {
    if (this.messages.mongo) {
      const result = await this.db.query(`select l.*,count(c.id)::int as conversations_count,
        array_remove(array_agg(c.id),null) as conversation_ids from leads l left join conversations c on c.lead_id=l.id and c.company_id=l.company_id
        where l.company_id=$1 group by l.id order by l.updated_at desc limit $2`, [companyId, limit]);
      // Bound each batch to the platform summary limit.
      const ids = result.rows.flatMap(row => row.conversation_ids as string[]);
      const summaries: { conversationId: string; lastMessageAt: Date }[] = [];
      for (let i = 0; i < ids.length; i += 200) summaries.push(...await this.messages.summary(companyId, ids.slice(i, i + 200)));
      for (const row of result.rows) {
        const times = summaries.filter(item => row.conversation_ids.includes(item.conversationId)).map(item => item.lastMessageAt.getTime());
        row.last_message_at = times.length ? new Date(Math.max(...times)) : null;
        delete row.conversation_ids;
      }
      return result;
    }
    return this.db.query(`select l.id, l.company_id, l.whatsapp_number, l.name, l.status, l.qualification, l.created_at, l.updated_at,
      count(distinct c.id)::int as conversations_count, max(m.created_at) as last_message_at from leads l
      left join conversations c on c.lead_id = l.id left join messages m on m.conversation_id = c.id
      where l.company_id = $1 group by l.id order by coalesce(max(m.created_at), l.updated_at) desc limit $2`, [companyId, limit]);
  }

  async findById(companyId: string, id: string) { return this.db.query('select * from leads where company_id = $1 and id = $2', [companyId, id]); }
  async updateStatus(companyId: string, id: string, status: string) { return this.db.query('update leads set status = $3, updated_at = now() where company_id = $1 and id = $2 returning *', [companyId, id, status]); }
  async inspectByWhatsAppNumber(companyId: string, phone: string) {
    return this.db.query(`select l.id as lead_id, l.whatsapp_number, l.qualification, c.id as conversation_id, c.state
      from leads l join conversations c on c.lead_id = l.id where l.company_id = $1 and l.whatsapp_number = $2 order by l.updated_at desc limit 1`, [companyId, phone]);
  }
}
