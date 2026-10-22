import { SalesSchedulingService } from './sales-scheduling.service';

describe('SalesSchedulingService', () => {
  const input = { companyId: 'sabero', conversationId: 'conversation', leadId: 'lead', message: 'Quiero una reunión' };
  const slot = { start: '2026-10-22T14:00:00.000Z', end: '2026-10-22T14:30:00.000Z', label: '' };
  function setup(state: any = {}, decision: any = { action: 'availability' }) {
    const db = { query: jest.fn().mockImplementation(async (sql: string, _params?: unknown[]) => sql.startsWith('select') ? { rows: [{ state: { booking: state }, external_id: '51900000000' }] } : { rows: [] }) };
    const ai = { complete: jest.fn().mockResolvedValue({ content: JSON.stringify(decision) }) };
    const calendar = { getAvailability: jest.fn().mockResolvedValue({ busy: [] }), createMeeting: jest.fn().mockResolvedValue({ id: 'meeting' }) };
    const config = { get: jest.fn((key: string) => key === 'DEFAULT_TIMEZONE' ? 'America/Lima' : undefined) };
    return { service: new SalesSchedulingService(db as any, ai as any, calendar as any, config as any), db, ai, calendar };
  }
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-21T20:00:00Z')); });
  afterEach(() => { jest.useRealTimers(); });

  it('leaves ordinary sales questions to the sales agent', async () => {
    const { service, ai } = setup();
    expect(await service.respond({ ...input, message: '¿Qué servicios tienen?' })).toBeNull();
    expect(ai.complete).not.toHaveBeenCalled();
  });
  it('asks for morning or afternoon before querying a full day', async () => {
    const { service, calendar } = setup({}, { action: 'availability', date: '2026-10-22' });
    expect(await service.respond(input)).toContain('mañana o por la tarde');
    expect(calendar.getAvailability).not.toHaveBeenCalled();
  });
  it('offers only real free slots and accepts a different time', async () => {
    const { service, calendar } = setup({}, { action: 'availability', date: '2026-10-22', period: 'morning' });
    calendar.getAvailability.mockResolvedValue({ busy: [{ start: '2026-10-22T14:00:00Z', end: '2026-10-22T15:00:00Z' }] } as any);
    const answer = await service.respond(input);
    expect(calendar.getAvailability).toHaveBeenCalledWith({ companyId: 'sabero', timeMin: '2026-10-22T14:00:00.000Z', timeMax: '2026-10-22T17:00:00.000Z' });
    expect(answer).toContain('10:00');
    expect(answer).not.toContain('09:00');
    expect(answer).toContain('proponer otra hora');
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('checks a customer-proposed time instead of accepting it blindly', async () => {
    const { service, calendar, db } = setup({ active: true, date: '2026-10-22', pending: slot }, { action: 'select', time: '15:00' });
    calendar.getAvailability.mockResolvedValue({ busy: [{ start: '2026-10-22T20:00:00Z', end: '2026-10-22T21:00:00Z' }] } as any);
    expect(await service.respond({ ...input, message: '¿A las 3 de la tarde?' })).toContain('ocupado');
    expect(calendar.createMeeting).not.toHaveBeenCalled();
    const updates = db.query.mock.calls.filter(([sql]) => sql.startsWith('update'));
    expect(JSON.parse(updates[0][1]![2] as string).pending).toBeUndefined();
  });
  it('does not treat calendar errors as availability', async () => {
    const { service, calendar } = setup({}, { action: 'availability', date: '2026-10-22', period: 'morning' });
    calendar.getAvailability.mockRejectedValue(new Error('invalid_grant'));
    expect(await service.respond(input)).toContain('No puedo consultar');
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('requires explicit confirmation before creating a meeting', async () => {
    const { service, calendar } = setup({ active: true, pending: slot, name: 'Cliente', email: 'cliente@example.com' }, { action: 'confirm' });
    expect(await service.respond({ ...input, message: 'Tengo una duda' })).toContain('¿Confirmas');
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('creates a meeting with the confirmed slot and tenant-scoped idempotency key', async () => {
    const { service, calendar } = setup({ active: true, pending: slot, name: 'Cliente', email: 'cliente@example.com' }, { action: 'confirm' });
    expect(await service.respond({ ...input, message: 'Sí, confirmo' })).toContain('Reunión agendada');
    expect(calendar.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ company_id: 'sabero', start_time: slot.start, end_time: slot.end, attendee_email: 'cliente@example.com', idempotency_key: expect.any(String) }));
  });
  it('does not book a negated confirmation even if extraction misclassifies it', async () => {
    const { service, calendar } = setup({ active: true, pending: slot, name: 'Cliente', email: 'cliente@example.com' }, { action: 'confirm' });
    await service.respond({ ...input, message: 'No confirmo' });
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('recognizes a standalone accented sí as explicit acceptance', async () => {
    const { service, calendar } = setup({ active: true, pending: slot, name: 'Cliente', email: 'cliente@example.com' }, { action: 'confirm' });
    await service.respond({ ...input, message: 'Sí' });
    expect(calendar.createMeeting).toHaveBeenCalledTimes(1);
  });
  it('rejects a confirmation for an expired pending slot', async () => {
    const { service, calendar } = setup({ active: true, pending: { ...slot, start: '2026-10-20T14:00:00Z', end: '2026-10-20T14:30:00Z' }, name: 'Cliente', email: 'cliente@example.com' }, { action: 'confirm' });
    expect(await service.respond({ ...input, message: 'Confirmo' })).toContain('ya no es válido');
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('does not confirm booking when the slot was taken before creation', async () => {
    const { service, calendar } = setup({ active: true, pending: slot, name: 'Cliente', email: 'cliente@example.com' }, { action: 'confirm' });
    calendar.createMeeting.mockRejectedValue(new Error('Selected calendar slot is busy'));
    expect(await service.respond({ ...input, message: 'Confirmo' })).toContain('acaba de ocuparse');
  });
  it('does not create a meeting when the customer only shares contact details', async () => {
    const { service, calendar } = setup({ active: true, pending: slot }, { action: 'select', name: 'Cliente', email: 'cliente@example.com' });
    expect(await service.respond({ ...input, message: 'Soy Cliente, cliente@example.com' })).toContain('¿Confirmas');
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('rejects dates in the past and weekends', async () => {
    const { service, calendar } = setup({}, { action: 'availability', date: '2026-10-24', period: 'morning' });
    expect(await service.respond(input)).toContain('No tengo horarios');
    expect(calendar.getAvailability).not.toHaveBeenCalled();
  });
});
