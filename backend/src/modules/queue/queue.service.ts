import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JobClaimRepository } from '../../infrastructure/prisma/job-claim.repository';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export type QueueJobType = 'followup.process' | 'drive.sync' | 'opportunity.review';

@Injectable()
export class QueueService {
  constructor(private readonly prisma: PrismaService, private readonly claims: JobClaimRepository) {}

  async enqueue(type: QueueJobType, companyId: string, payload: Record<string, unknown> = {}, runAt = new Date(), dedupeKey?: string) {
    const key = dedupeKey || `${type}:${runAt.toISOString()}`;
    try { await this.prisma.jobQueue.create({ data: { jobType: type, companyId, payload: payload as Prisma.InputJsonValue, runAt, dedupeKey: key } }); } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error; }
  }

  async claim(limit = 10) {
    return this.claims.claim(Math.min(Math.max(limit, 1), 50));
  }

  async complete(id: string) {
    await this.prisma.jobQueue.update({ where: { id }, data: { status: 'completed', dedupeKey: null, completedAt: new Date(), updatedAt: new Date() } });
  }

  async fail(id: string, attempts: number, error: string) {
    const terminal = attempts >= 5;
    await this.prisma.jobQueue.update({ where: { id }, data: { status: terminal ? 'dead' : 'pending', errorMessage: error.slice(0, 2000), runAt: new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000), lockedAt: null, lockExpiresAt: null, updatedAt: new Date() } });
  }
}
