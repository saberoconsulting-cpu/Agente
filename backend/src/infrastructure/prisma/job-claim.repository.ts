import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export type ClaimedJob = { id: string; job_type: 'followup.process' | 'drive.sync' | 'opportunity.review'; company_id: string; payload: Record<string, unknown>; attempts: number };

@Injectable()
export class JobClaimRepository {
  constructor(private readonly prisma: PrismaService) {}

  async claim(limit: number): Promise<ClaimedJob[]> {
    return this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      with claimed as (
        select id from job_queue where status = 'pending' and run_at <= now()
        order by run_at asc limit ${limit} for update skip locked
      ) update job_queue j set status = 'processing', attempts = attempts + 1,
        locked_at = now(), lock_expires_at = now() + interval '10 minutes', updated_at = now()
      from claimed where j.id = claimed.id
      returning j.id, j.job_type, j.company_id, j.payload, j.attempts`);
  }
}
