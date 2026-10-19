import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toDatabaseShape } from '../../infrastructure/prisma/serialize';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, limit = 50) {
    const conversations = await this.prisma.conversation.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200) });
    const rows = await Promise.all(conversations.map(async (conversation) => {
      const [lead, aggregate] = await Promise.all([
        conversation.leadId ? this.prisma.lead.findUnique({ where: { id: conversation.leadId }, select: { name: true, whatsappNumber: true } }) : null,
        this.prisma.message.aggregate({ where: { conversationId: conversation.id }, _count: { id: true }, _max: { createdAt: true } }),
      ]);
      return { ...conversation, leadName: lead?.name || null, whatsappNumber: lead?.whatsappNumber || null, messagesCount: aggregate._count.id, lastMessageAt: aggregate._max.createdAt };
    }));
    return toDatabaseShape(rows);
  }

  async messages(companyId: string, conversationId: string, limit = 100) {
    return toDatabaseShape(await this.prisma.message.findMany({ where: { companyId, conversationId }, select: { id: true, companyId: true, conversationId: true, providerMessageId: true, direction: true, messageType: true, textBody: true, createdAt: true }, orderBy: { createdAt: 'asc' }, take: Math.min(Math.max(limit, 1), 300) }));
  }
}
