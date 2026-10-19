import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export type QueueJobType = 'followup.process' | 'drive.sync' | 'opportunity.review';

@Injectable()
export class QueueService {
  constructor(private readonly db: DatabaseService) {}

  async enqueue(type: QueueJobType, companyId: string, payload: Record<string, unknown> = {}, runAt = new Date(), dedupeKey?: string) {
    await this.db.query(
      `insert into job_queue (job_type, company_id, payload, run_at, dedupe_key)
       values ($1, $2, $3, $4, $5)
       on conflict (job_type, company_id, dedupe_key) where dedupe_key is not null do nothing`,
      [type, companyId, JSON.stringify(payload), runAt.toISOString(), dedupeKey || `${type}:${runAt.toISOString()}`],
    );
  }

  async claim(limit = 10) {
    const result = await this.db.query<{ id: string; job_type: QueueJobType; company_id: string; payload: Record<string, unknown>; attempts: number }>(
      `with claimed as (
         select id from job_queue
         where status = 'pending' and run_at <= now()
         order by run_at asc
         limit $1 for update skip locked
       )
       update job_queue j set status = 'processing', attempts = attempts + 1,
         locked_at = now(), lock_expires_at = now() + interval '10 minutes', updated_at = now()
       from claimed where j.id = claimed.id
       returning j.id, j.job_type, j.company_id, j.payload, j.attempts`,
      [Math.min(Math.max(limit, 1), 50)],
    );
    return result.rows;
  }

  async complete(id: string) {
    await this.db.query(`update job_queue set status = 'completed', dedupe_key = null, completed_at = now(), updated_at = now() where id = $1`, [id]);
  }

  async fail(id: string, attempts: number, error: string) {
    const terminal = attempts >= 5;
    await this.db.query(
      `update job_queue set status = $2, error_message = $3,
        run_at = now() + (($4::text || ' minutes')::interval), locked_at = null, lock_expires_at = null, updated_at = now()
       where id = $1`,
      [id, terminal ? 'dead' : 'pending', error.slice(0, 2000), Math.min(2 ** attempts, 60)],
    );
  }
}
