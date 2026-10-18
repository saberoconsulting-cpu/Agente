import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LeadsService {
  constructor(private readonly db: DatabaseService) {}

  async list(companyId: string, limit = 50) {
    const result = await this.db.query(
      `select
         l.id,
         l.company_id,
         l.whatsapp_number,
         l.name,
         l.status,
         l.qualification,
         l.created_at,
         l.updated_at,
         count(distinct c.id)::int as conversations_count,
         max(m.created_at) as last_message_at
       from leads l
       left join conversations c on c.lead_id = l.id
       left join messages m on m.conversation_id = c.id
       where l.company_id = $1
       group by l.id
       order by coalesce(max(m.created_at), l.updated_at) desc
       limit $2`,
      [companyId, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows;
  }

  async get(companyId: string, id: string) {
    const result = await this.db.query(
      `select *
       from leads
       where company_id = $1 and id = $2`,
      [companyId, id],
    );
    return result.rows[0] || null;
  }

  async updateStatus(companyId: string, id: string, status: string) {
    const result = await this.db.query(
      `update leads
       set status = $3, updated_at = now()
       where company_id = $1 and id = $2
       returning *`,
      [companyId, id, status],
    );
    return result.rows[0] || null;
  }
}
