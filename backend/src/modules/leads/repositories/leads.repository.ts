import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class LeadsRepository {
  constructor(private readonly db: DatabaseService) {}

  async list(companyId: string, limit: number) {
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
