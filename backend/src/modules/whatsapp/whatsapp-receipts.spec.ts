import { WhatsappService } from './whatsapp.service';
import { MessageStore } from '../platform/message-store.service';

describe('WhatsApp delivery receipts', () => {
  it('records status-only webhooks in the resolved tenant without invoking the agent', async () => {
    const store = { inboundEvent: jest.fn().mockResolvedValue('event'), recordReceipt: jest.fn() };
    const agent = { respondToMessage: jest.fn() };
    const connections = { findActiveByPhoneNumberId: jest.fn().mockResolvedValue({ company_id: 'tenant-b' }) };
    const service = new WhatsappService({ get: jest.fn() } as any, {} as any, agent as any, {} as any, {} as any,
      connections as any, store as any, { assertCompany: jest.fn() } as any, { ensure: jest.fn() } as any);
    jest.spyOn(service as any, 'validateSignature').mockImplementation(() => {});
    await service.receiveWebhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: 'phone-b' },
      statuses: [{ id: 'wamid.1', status: 'read', timestamp: '1794661200' }, { id: 'bad', status: 'unknown', timestamp: 'invalid' }],
    } }] }] });
    expect(store.recordReceipt).toHaveBeenCalledTimes(1);
    expect(store.recordReceipt).toHaveBeenCalledWith('tenant-b', 'wamid.1', 'read', new Date(1794661200000).toISOString());
    expect(agent.respondToMessage).not.toHaveBeenCalled();
  });

  it('scopes Postgres receipt writes and reads by company and exposes confirmed status', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const platform = { mongo: false, assertCompany: jest.fn() };
    const store = new MessageStore(platform as any, db as any);
    await store.recordReceipt('tenant-a', 'wamid.1', 'read', '2026-11-14T10:00:00Z');
    expect(db.query.mock.calls[0][1]).toEqual(['tenant-a', 'wamid.1', 'read', '2026-11-14T10:00:00Z']);
    db.query.mockResolvedValueOnce({ rows: [{ id: 'm', company_id: 'tenant-a', conversation_id: 'c', direction: 'outbound', provider_message_id: 'wamid.1', created_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ provider_message_id: 'wamid.1', status: 'read', occurred_at: new Date() }] });
    expect((await store.list('tenant-a', 'c', 60)).items[0].deliveryStatus).toBe('read');
    expect(db.query.mock.calls[2][1]).toEqual(['tenant-a', ['wamid.1']]);
  });
});
