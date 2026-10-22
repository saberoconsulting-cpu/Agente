import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { toDatabaseShape } from '../../infrastructure/prisma/serialize';
import { MessageStore } from '../platform/message-store.service';
import { ConversationMessage, ConversationMessagePage, toConversationMessage } from './conversation-message.types';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService, private readonly store: MessageStore) {}

  async list(companyId: string, limit = 50) {
    const conversations = await this.prisma.conversation.findMany({ where: { companyId }, orderBy: { updatedAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200) });
    const summaries = await this.store.summary(companyId, conversations.map(item => item.id));
    const rows = await Promise.all(conversations.map(async (conversation) => {
      const lead = conversation.leadId ? await this.prisma.lead.findFirst({ where: { id: conversation.leadId, companyId }, select: { name: true, whatsappNumber: true } }) : null;
      const summary = summaries.find(item => item.conversationId === conversation.id);
      return { ...conversation, leadName: lead?.name || null, whatsappNumber: lead?.whatsappNumber || null, messagesCount: summary?.count || 0, lastMessageAt: summary?.lastMessageAt || null };
    }));
    return toDatabaseShape(rows);
  }

  async messages(companyId: string, conversationId: string, limit = 100): Promise<ConversationMessage[]> {
    return (await this.messagePage(companyId, conversationId, limit)).items;
  }

  async messagePage(companyId: string, conversationId: string, limit = 100, cursor?: string): Promise<ConversationMessagePage> {
    const page = await this.store.list(companyId, conversationId, limit, cursor);
    return { items: page.items.map(toConversationMessage), next_cursor: page.nextCursor };
  }
}
