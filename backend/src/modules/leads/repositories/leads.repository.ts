import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MessageStore } from '../../platform/message-store.service';

@Injectable()
export class LeadsRepository {
  constructor(private readonly db: DatabaseService, private readonly messages: MessageStore) {}

  async list(companyId: string, limit: number, filters: {search?:string;stage?:string;from?:string;to?:string;assignee?:string;offset?:number}={}) {
    const result=await this.db.query(`select l.*,coalesce(nullif(l.name,''),c.state->'booking'->>'name') as name,count(*) over()::int as total_count,
      c.id as conversation_id,c.state->'attention' as attention,
      (select count(*)::int from conversations where company_id=l.company_id and lead_id=l.id) as conversations_count,
      array(select id from conversations where company_id=l.company_id and lead_id=l.id) as conversation_ids,
      o.id as opportunity_id,coalesce(o.stage,'nuevo') as commercial_stage,o.next_action,o.service_interest,
      coalesce(h.email,u.email) as assignee_email,coalesce(c.state->'attention'->>'assignee_id',o.assignee_id::text) as assignee_id
      from leads l
      left join lateral(select id,state,updated_at from conversations where company_id=l.company_id and lead_id=l.id order by updated_at desc limit 1)c on true
      left join lateral(select * from opportunities where company_id=l.company_id and lead_id=l.id order by created_at desc limit 1)o on true
      left join admin_users u on u.id=o.assignee_id and u.company_id=l.company_id
      left join admin_users h on h.id::text=c.state->'attention'->>'assignee_id' and h.company_id=l.company_id
      where l.company_id=$1
      and ($3::text is null or translate(lower(concat_ws(' ',l.name,c.state->'booking'->>'name',l.whatsapp_number,o.stage,
        case o.stage when 'nuevo' then 'nuevo' when 'calificado' then 'en conversacion' when 'reunion_propuesta' then 'reunion pendiente por agendar' when 'reunion_agendada' then 'reunion agendada' when 'propuesta' then 'negociacion' when 'ganado' then 'cliente ganado' when 'perdido' then 'perdido no interesado' else o.stage end)),'áéíóúñ','aeioun') like $3)
      and ($4::text is null or coalesce(o.stage,'nuevo')=$4)
      and ($5::date is null or l.created_at>=($5::date at time zone 'America/Lima'))
      and ($6::date is null or l.created_at<(($6::date+1) at time zone 'America/Lima'))
      and ($7::text is null or ($7='ai' and coalesce(c.state->'attention'->>'mode','auto')='auto') or coalesce(c.state->'attention'->>'assignee_id',o.assignee_id::text)=$7)
      order by greatest(l.updated_at,c.updated_at) desc limit $2 offset $8`,[companyId,limit,filters.search?`%${filters.search.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}%`:null,filters.stage||null,filters.from||null,filters.to||null,filters.assignee||null,filters.offset||0]);
    const ids=result.rows.flatMap(row=>Array.isArray(row.conversation_ids)?row.conversation_ids:[]);
    const summaries:Awaited<ReturnType<MessageStore['summary']>>=[];
    for(let i=0;i<ids.length;i+=200)summaries.push(...await this.messages.summary(companyId,ids.slice(i,i+200)));
    for(const row of result.rows){
      const related=summaries.filter(item=>(row.conversation_ids||[]).includes(item.conversationId)).filter(item=>Number.isFinite(new Date(item.lastMessageAt).getTime()));
      related.sort((a,b)=>new Date(b.lastMessageAt).getTime()-new Date(a.lastMessageAt).getTime());
      row.last_message_at=related[0]?.lastMessageAt||null;
      row.last_message=related[0]?.preview||null;
      row.awaiting_reply=related[0]?.lastDirection==='inbound';
      row.needs_followup=related[0]?.lastDirection==='outbound'&&Date.now()-new Date(related[0].lastMessageAt).getTime()>48*60*60*1000&&!['ganado','perdido'].includes(row.commercial_stage);
      const first=related.map(item=>item.firstMessageAt).filter((date):date is Date=>!!date&&Number.isFinite(new Date(date).getTime()));
      row.first_contact_at=first.length?new Date(Math.min(...first.map(date=>new Date(date).getTime()))):row.created_at;
      row.attention=row.attention||{mode:'auto'};
      delete row.conversation_ids;
    }
    return result;
  }

  async findById(companyId: string, id: string) { return this.db.query('select * from leads where company_id = $1 and id = $2', [companyId, id]); }
  async updateStatus(companyId: string, id: string, status: string) { return this.db.query('update leads set status = $3, updated_at = now() where company_id = $1 and id = $2 returning *', [companyId, id, status]); }
  async inspectByWhatsAppNumber(companyId: string, phone: string) {
    return this.db.query(`select l.id as lead_id, l.whatsapp_number, l.qualification, c.id as conversation_id, c.state
      from leads l join conversations c on c.lead_id = l.id where l.company_id = $1 and l.whatsapp_number = $2 order by l.updated_at desc limit 1`, [companyId, phone]);
  }
}
