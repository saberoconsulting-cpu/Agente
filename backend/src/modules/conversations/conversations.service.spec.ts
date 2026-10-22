import { ConversationsService } from './conversations.service';
import { MessageStore } from '../platform/message-store.service';

describe('Conversation message response contract', () => {
  it.each([false, true])('returns the public message shape with mongo=%s', async mongo => {
    const date = '2026-10-19T12:00:00.000Z';
    const platform = { mongo, assertCompany: jest.fn(), request: jest.fn().mockResolvedValue({
      items: [{ id: 'message', conversationId: 'conversation', direction: 'inbound', messageType: 'text',
        providerMessageId: 'provider', textBody: 'Hola', createdAt: date }], nextCursor: 'older',
    }) };
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'message', company_id: 'company',
      conversation_id: 'conversation', direction: 'inbound', message_type: 'text', provider_message_id: 'provider',
      text_body: 'Hola', created_at: new Date(date) }] }) };
    const store = new MessageStore(platform as any, db as any);
    const service = new ConversationsService({} as any, store);
    const page = await service.messagePage('company', 'conversation', 25, 'cursor');
    expect(JSON.parse(JSON.stringify(page))).toEqual({ items: [{ id: 'message', company_id: 'company',
      conversation_id: 'conversation', provider_message_id: 'provider', direction: 'inbound', message_type: 'text',
      text_body: 'Hola', created_at: date }], next_cursor: mongo ? 'older' : null });
    expect(await service.messages('company', 'conversation')).toEqual(page.items);
    expect(platform.assertCompany).toHaveBeenCalledWith('company');
  });
});
