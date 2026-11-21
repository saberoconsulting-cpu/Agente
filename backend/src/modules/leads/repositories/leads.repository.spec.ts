import { LeadsRepository } from './leads.repository';

describe('Contact message ordering', () => {
  it('orders all matching contacts by their last real message before pagination, not administrative updates', async () => {
    const activity = [{ conversation_id: 'chat-other-page', last_message_at: '2026-11-14T18:00:00Z' }];
    const db = { query: jest.fn().mockResolvedValue({ rows: [] }) };
    const messages = { activity: jest.fn().mockResolvedValue(activity), summary: jest.fn() };
    await new LeadsRepository(db as any, messages as any).list('tenant-a', 10, { offset: 10 });
    expect(messages.activity).toHaveBeenCalledWith('tenant-a');
    const [sql, parameters] = db.query.mock.calls[0];
    expect(sql).toContain('lc.company_id=l.company_id');
    expect(sql).toContain('order by activity.last_message_at desc nulls last,l.created_at desc,l.id desc limit $2 offset $8');
    expect(sql).not.toContain('order by greatest(l.updated_at');
    expect(parameters[0]).toBe('tenant-a');
    expect(parameters[7]).toBe(10);
    expect(parameters[8]).toBe(JSON.stringify(activity));
  });

  it('marks a latest customer reply as awaiting a response without a time delay', async () => {
    const db = { query: jest.fn().mockResolvedValue({ rows: [{ id: 'lead', conversation_ids: ['chat'], created_at: new Date(), commercial_stage: 'nuevo' }] }) };
    const messages = { activity: jest.fn().mockResolvedValue([]), summary: jest.fn().mockResolvedValue([
      { conversationId: 'chat', lastMessageAt: new Date(), lastDirection: 'inbound', preview: 'Sí, mañana', count: 1 },
    ]) };
    const result = await new LeadsRepository(db as any, messages as any).list('tenant-b', 10);
    expect(result.rows[0]).toMatchObject({ awaiting_reply: true, last_message: 'Sí, mañana' });
    expect(messages.summary).toHaveBeenCalledWith('tenant-b', ['chat']);
  });
});
