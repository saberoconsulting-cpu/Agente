import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';

export type Attention = { mode: 'auto' | 'human'; assignee_id?: string; version?: string };
@Injectable()
export class ConversationControlService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}
  async get(companyId: string, conversationId: string): Promise<Attention> {
    const result = await this.db.query("select state->'attention' as attention from conversations where company_id=$1 and id=$2", [companyId, conversationId]);
    if (!result.rowCount) throw new NotFoundException('Conversación no encontrada');
    return result.rows[0].attention || { mode: 'auto' };
  }
  async change(companyId: string, conversationId: string, actorId: string, mode: 'auto' | 'human') {
    return this.db.conversationLock(companyId, conversationId, async () => {
      const previous = await this.get(companyId, conversationId);
      if (previous.mode === 'human' && previous.assignee_id !== actorId) throw new ConflictException('Otro asesor está atendiendo esta conversación.');
      const attention: Attention = { mode, ...(mode === 'human' ? { assignee_id: actorId } : {}), version: randomUUID() };
      await this.db.query("update conversations set state=jsonb_set(coalesce(state,'{}'::jsonb),'{attention}',$3::jsonb),updated_at=now() where company_id=$1 and id=$2", [companyId, conversationId, JSON.stringify(attention)]);
      await this.audit.record({ companyId, actorId, actorType: 'admin_user', action: `conversation.${mode === 'human' ? 'taken' : 'returned_to_ai'}`, resourceType: 'conversation', resourceId: conversationId });
      return attention;
    });
  }
  async sendIfAutomatic<T>(companyId: string, conversationId: string, version: string | undefined, send: () => Promise<T>):Promise<T|undefined> {
    return this.db.conversationLock(companyId, conversationId, async () => {
      const attention = await this.get(companyId, conversationId);
      if (attention.mode !== 'auto' || attention.version !== version) return;
      return send();
    });
  }
}
