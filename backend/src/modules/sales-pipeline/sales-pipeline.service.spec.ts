import { SalesPipelineService } from './sales-pipeline.service';

describe('SalesPipelineService', () => {
  const input = { companyId: 'empresa-a', leadId: 'lead-a', conversationId: 'chat-a', message: 'Me interesa coordinar una reunión' };
  function setup(options: { stage?: string; manual?: boolean; mode?: string; booking?: unknown; decision?: unknown } = {}) {
    const db = { query: jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('select policy_text')) return { rows: [{ policy_text: options.mode || 'services' }] };
      if (sql.includes('select o.id')) return { rows: [{ id: 'opportunity-a', stage: options.stage || 'nuevo', score_signals: { manual_stage: options.manual || false }, booking: options.booking, qualification: {} }] };
      return { rows: [], rowCount: 0 };
    }) };
    const ai = { complete: jest.fn().mockResolvedValue({ content: JSON.stringify(options.decision || { stage: 'reunion_propuesta', confidence: 0.95, reason: 'Acepta coordinar', next_action: 'Pedir día y hora' }) }) };
    const messages = { list: jest.fn().mockResolvedValue({ items: [{ direction: 'inbound', textBody: input.message }] }) };
    return { service: new SalesPipelineService(db as any, ai as any, messages as any), db, ai, messages };
  }
  function update(db: ReturnType<typeof setup>['db']) { return db.query.mock.calls.find(([sql]) => sql.startsWith('with changed'))!; }

  it('creates tenant-scoped opportunities and classifies a meeting request from chat context', async () => {
    const { service, db, messages } = setup();
    await service.sync(input);
    expect(db.query.mock.calls[0][1]).toEqual(['empresa-a', 'lead-a', 'chat-a']);
    expect(messages.list).toHaveBeenCalledWith('empresa-a', 'chat-a', 20);
    expect(update(db)[1][2]).toBe('reunion_propuesta');
    expect(update(db)[0]).toContain('company_id=$2');
    expect(update(db)[0]).toContain('stage=$8');
  });
  it('respects a manual move and also rechecks ownership at write time', async () => {
    const { service, db } = setup({ stage: 'calificado', manual: true });
    await service.sync(input);
    expect(update(db)[1][2]).toBe('calificado');
    expect(update(db)[0]).toContain("score_signals->>'manual_stage'");
  });
  it('does not infer payments or shipments from customer text', async () => {
    const { service, db } = setup({ mode: 'products', decision: { stage: 'pagado', confidence: 1 } });
    await service.sync({ ...input, message: 'Ya te pagué' });
    expect(update(db)[1][2]).toBe('nuevo');
  });
  it('never overwrites a paid, shipped, won or lost card', async () => {
    for (const stage of ['pagado', 'en_envio', 'ganado', 'perdido']) {
      const { service, db, ai } = setup({ stage });
      await service.sync(input);
      expect(ai.complete).not.toHaveBeenCalled();
      expect(update(db)).toBeUndefined();
    }
  });
  it('uses booking records to distinguish a pending request from a real meeting', async () => {
    for (const [booking, expected] of [[{ status: 'pending_advisor' }, 'reunion_propuesta'], [{ booked: { id: 'meeting' } }, 'reunion_agendada'], [{ status: 'pending_advisor', booked: { id: 'previous-meeting' } }, 'reunion_propuesta']] as const) {
      const { service, db } = setup({ booking });
      await service.sync(input);
      expect(update(db)[1][2]).toBe(expected);
    }
  });
  it('keeps the stage for uncertain classifications and malformed model output', async () => {
    const { service, db, ai } = setup({ stage: 'calificado', decision: { stage: 'perdido', confidence: 0.4 } });
    await service.sync(input);
    expect(update(db)[1][2]).toBe('calificado');
    ai.complete.mockResolvedValue({ content: 'invalid json' });
    await expect(service.sync(input)).resolves.toBeUndefined();
  });
  it('rejects an invalid pipeline mode before writing any data', async () => {
    const { service, db } = setup();
    await expect(service.configure('empresa-a', 'invalid' as any)).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });
  it('imports old chats without reopening closed deals or duplicating cards', async () => {
    const { service, db } = setup();
    await service.importContacts('empresa-a');
    expect(db.query.mock.calls[1][1]).toEqual(['empresa-a', 'services']);
    expect(db.query.mock.calls[1][0]).toContain('not exists(select 1 from opportunities');
    expect(db.query.mock.calls[1][0]).toContain('on conflict');
  });
});
