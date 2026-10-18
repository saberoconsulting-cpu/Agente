import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type AuditInput = {
  companyId: string;
  actorType?: string;
  actorId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async record(input: AuditInput) {
    await this.db.query(
      `insert into audit_logs (
         company_id, actor_type, actor_id, action, resource_type, resource_id, metadata
       )
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        input.companyId,
        input.actorType || 'system',
        input.actorId || null,
        input.action,
        input.resourceType || null,
        input.resourceId || null,
        JSON.stringify(input.metadata || {}),
      ],
    );
  }

  async list(companyId: string, limit = 50) {
    const result = await this.db.query(
      `select id, company_id, actor_type, actor_id, action, resource_type, resource_id, metadata, created_at
       from audit_logs
       where company_id = $1
       order by created_at desc
       limit $2`,
      [companyId, Math.min(Math.max(limit, 1), 200)],
    );
    return result.rows;
  }
}
