import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toDatabaseShape } from '../../infrastructure/prisma/serialize';

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
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput) {
    await this.prisma.auditLog.create({ data: { companyId: input.companyId, actorType: input.actorType || 'system', actorId: input.actorId || null, action: input.action, resourceType: input.resourceType || null, resourceId: input.resourceId || null, metadata: (input.metadata || {}) as Prisma.InputJsonValue } });
  }

  async list(companyId: string, limit = 50) {
    return toDatabaseShape(await this.prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200) }));
  }
}
