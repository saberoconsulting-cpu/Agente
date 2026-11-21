/// <reference types="jest" />
import { SalesSchedulingService } from './sales-scheduling.service';

describe('SalesSchedulingService', () => {
  const input = { companyId: 'sabero', conversationId: 'conversation', leadId: 'lead', message: 'Quiero disponibilidad para una reunión' };
  const slot = { start: '2026-10-22T14:00:00.000Z', end: '2026-10-22T14:30:00.000Z', label: '' };
  function setup(state: any = {}, decision: any = { action: 'availability' }, calendarEnabled = true) {
    const db = { query: jest.fn().mockImplementation(async (sql: string, _params?: unknown[]) => sql.startsWith('select') ? { rows: [{ state: { booking: state }, external_id: '51900000000' }] } : { rows: [] }) };
    const ai = { complete: jest.fn().mockResolvedValue({ content: JSON.stringify(decision) }) };
    const calendar = { getAvailability: jest.fn().mockResolvedValue({ busy: [] }), createMeeting: jest.fn().mockResolvedValue({ id: 'meeting' }) };
    if (!calendarEnabled) calendar.getAvailability.mockRejectedValue(new Error('Calendar not active'));
    const config = { get: jest.fn((key: string) => key === 'DEFAULT_TIMEZONE' ? 'America/Lima' : key === 'SALES_CALENDAR_BOOKING_ENABLED' && calendarEnabled ? 'true' : undefined) };
    return { service: new SalesSchedulingService(db as any, ai as any, calendar as any, config as any), db, ai, calendar };
  }
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-21T20:00:00Z')); });
  afterEach(() => { jest.useRealTimers(); });
  it('keeps Sabero custom meeting questions out of another company', async () => {
    const { service } = setup({}, { action: 'availability' });
    const answer = await service.respond({ ...input, companyId: 'otra-empresa', message: 'Quiero una cita' });
    expect(answer).toContain('mañana o por la tarde');
    expect(answer).not.toContain('proyecto');
    expect(answer).not.toContain('requerimientos');
  });

  it('keeps availability suggestions for other companies instead of enforcing Sabero exact-time collection', async () => {
    const { service } = setup({ active: true, date: '2026-10-22' }, { action: 'availability', period: 'afternoon' });
    const answer = await service.respond({ ...input, companyId: 'otra-empresa', message: 'Por la tarde' });
    expect(answer).toContain('Consulté la agenda');
    expect(answer).not.toContain('¿Me confirmas qué hora');
  });
  it.each(['No', 'No gracias', 'Ahora no'])('leaves %s to the sales agent without continuing the scheduling questionnaire', async (message) => {
    const { service, db, ai, calendar } = setup({ active: true, date: '2026-10-22', awaitingPreference: 'period' });
    expect(await service.respond({ ...input, message })).toBeNull();
    expect(ai.complete).not.toHaveBeenCalled();
    expect(calendar.getAvailability).not.toHaveBeenCalled();
    const update = db.query.mock.calls.find(([sql]) => sql.startsWith('update conversations'))!;
    expect(JSON.parse(update[1]![2] as string).active).toBe(false);
  });

  it('lets the sales agent handle an objection while retaining scheduling preferences', async () => {
    const state = { active: true, date: '2026-10-22', period: 'morning' };
    const { service, calendar } = setup(state, { action: 'none' });
    expect(await service.respond({ ...input, message: 'Antes dime cuánto cuesta, me parece caro' })).toBeNull();
    expect(state).toMatchObject({ date: '2026-10-22', period: 'morning' });
    expect(calendar.getAvailability).not.toHaveBeenCalled();
  });

  it('accepts a complete proposed date and time without asking for the period', async () => {
    const { service } = setup({}, { action: 'select', date: '2026-10-22', time: '15:00' });
    const answer = await service.respond({ ...input, message: 'Reunión el jueves a las 15:00' });
    expect(answer).toContain('nombre y correo');
    expect(answer).not.toContain('qué hora');
    expect(answer).not.toContain('mañana o por la tarde');
  });

  it('treats a negative followed by another day as a date change', async () => {
    const { service, db } = setup({ active: true, date: '2026-10-22' }, { action: 'availability', date: '2026-10-23' });
    expect(await service.respond({ ...input, message: 'No mañana, el viernes' })).toContain('mañana o por la tarde');
    const update = db.query.mock.calls.find(([sql]) => sql.startsWith('update conversations'))!;
    expect(JSON.parse(update[1]![2] as string)).toMatchObject({ active: true, date: '2026-10-23' });
  });
  it.each(['Mañana', 'Por la mañana', 'Tarde'])('captures %s after asking for a period without relying on AI', async (message) => {
    const { service, db, ai } = setup({ active: true, date: '2026-10-22', awaitingPreference: 'period' }, { action: 'none' });
    const answer = await service.respond({ ...input, message });
    expect(answer).toContain('¿Me confirmas qué hora');
    expect(answer).not.toContain('mañana o por la tarde');
    expect(ai.complete).not.toHaveBeenCalled();
    const update = db.query.mock.calls.find(([sql]) => sql.startsWith('update conversations'))!;
    expect(JSON.parse(update[1]![2] as string)).toMatchObject({
      period: message === 'Tarde' ? 'afternoon' : 'morning', awaitingPreference: 'time',
    });
  });

  it('advances from date to period to exact time when the customer answers Mañana twice', async () => {
    jest.setSystemTime(new Date('2026-10-22T20:00:00Z')); // Thursday in Lima.
    let state: any = { active: true, awaitingPreference: 'date' };
    const answers: (string | null)[] = [];
    for (let turn = 0; turn < 2; turn++) {
      const { service, db, ai } = setup(state, { action: 'none' });
      answers.push(await service.respond({ ...input, message: 'Mañana' }));
      expect(ai.complete).not.toHaveBeenCalled();
      const update = db.query.mock.calls.find(([sql]) => sql.startsWith('update conversations'))!;
      state = JSON.parse(update[1]![2] as string);
    }
    expect(answers[0]).toContain('por la mañana o por la tarde');
    expect(answers[1]).toContain('¿Me confirmas qué hora');
    expect(state).toMatchObject({ date: '2026-10-23', period: 'morning', awaitingPreference: 'time' });
    expect(state.requestedTime).toBeUndefined();
  });

  it('keeps tomorrow as a date after the morning period is already known', async () => {
    const { service, ai } = setup({ active: true, period: 'morning' }, { action: 'availability', date: '2026-10-22' });
    expect(await service.respond({ ...input, message: 'Mañana' })).toContain('¿Me confirmas qué hora');
    expect(ai.complete).not.toHaveBeenCalled();
  });
  it('keeps name and email across manual turns even when AI classifies them as ordinary messages', async () => {
    let state: any = { active: true, date: '2026-10-22', period: 'afternoon', awaitingDetails: 'name' };
    for (const message of ['Roberto Lopez Calle', 'mi correo roberto@example.com']) {
      const { service, db } = setup(state, { action: 'none' }, false);
      const answer = await service.respond({ ...input, message });
      const update = db.query.mock.calls.find(([sql]) => sql.startsWith('update conversations'))!;
      state = JSON.parse(update[1]![2] as string);
      expect(state.name).toBe('Roberto Lopez Calle');
      expect(answer).not.toContain('compartes tu nombre');
    }
    expect(state.email).toBe('roberto@example.com');
  });

  it('collects manual meeting preferences across turns without calling Calendar', async () => {
    let state: any = {};
    const steps = [
      [{ action: 'availability' }, 'qué día de la semana'],
      [{ action: 'availability', date: '2026-10-22' }, 'por la mañana o por la tarde'],
      [{ action: 'availability', period: 'afternoon' }, '¿Me confirmas qué hora'],
      [{ action: 'select', time: '15:00' }, 'nombre'],
      [{ action: 'select', name: 'Ana' }, 'correo'],
      [{ action: 'select', email: 'ana@example.com' }, 'Todavía no hay una reunión reservada'],
    ] as const;
    for (const [decision, expected] of steps) {
      const { service, db, calendar } = setup(state, decision, false);
      const message = 'name' in decision ? decision.name : 'email' in decision ? decision.email : 'Quiero una reunión';
      expect(await service.respond({ ...input, message })).toContain(expected);
      expect(calendar.createMeeting).not.toHaveBeenCalled();
      const update = db.query.mock.calls.find(([sql]) => sql.startsWith('update conversations'))!;
      state = JSON.parse(update[1]![2] as string);
    }
    expect(state).toMatchObject({ status: 'pending_advisor', active: false, name: 'Ana', email: 'ana@example.com', date: '2026-10-22', requestedTime: '15:00' });
  });

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
    expect(await service.respond(input)).toContain('nombre');
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
    expect(calendar.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ company_id: 'sabero', start_time: slot.start, end_time: slot.end, attendee_email: 'cliente@example.com', idempotency_key: expect.any(String), create_meet: true }));
  });
  it('includes the Google Meet link in the confirmation when Calendar returns one', async () => {
    const { service, calendar } = setup({ active: true, pending: slot, name: 'Cliente', email: 'cliente@example.com' }, { action: 'confirm' });
    calendar.createMeeting.mockResolvedValue({ id: 'meeting', meet_link: 'https://meet.google.com/abc-defg-hij' });
    expect(await service.respond({ ...input, message: 'Sí, confirmo' })).toContain('https://meet.google.com/abc-defg-hij');
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
  it('excludes Sundays from availability', async () => {
    const { service, calendar } = setup({}, { action: 'availability', date: '2026-10-25', period: 'morning' });
    expect(await service.respond(input)).toContain('lunes a viernes');
    expect(calendar.getAvailability).not.toHaveBeenCalled();
  });
  it('searches beyond a closed Sunday when the customer accepts any day of the week', async () => {
    const { service, calendar } = setup({ active: true, date: '2026-10-25', period: 'afternoon' }, { action: 'availability' });
    const answer = await service.respond({ ...input, message: 'cualquiera busca en esa semana' });
    expect(answer).toContain('Consulté la agenda');
    expect(calendar.getAvailability).toHaveBeenCalledWith({ companyId: 'sabero', timeMin: '2026-10-26T19:00:00.000Z', timeMax: '2026-10-31T20:00:00.000Z' });
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('offers Saturday afternoon from noon and finishes by 15:00 Lima', async () => {
    const { service, calendar } = setup({}, { action: 'availability', date: '2026-10-24', period: 'afternoon' });
    expect(await service.respond(input)).toContain('Consulté la agenda');
    expect(calendar.getAvailability).toHaveBeenCalledWith({ companyId: 'sabero', timeMin: '2026-10-24T17:00:00.000Z', timeMax: '2026-10-24T20:00:00.000Z' });
  });
  it('rejects Saturday meetings that end after 15:00 Lima', async () => {
    const { service, calendar } = setup({ active: true, date: '2026-10-24' }, { action: 'select', time: '14:45' });
    expect(await service.respond(input)).toContain('fuera de atención');
    expect(calendar.createMeeting).not.toHaveBeenCalled();
  });
  it('offers remaining slots today even when the first hour of the period has passed', async () => {
    const { service, calendar } = setup({}, { action: 'availability', date: '2026-10-21', period: 'afternoon' });
    expect(await service.respond(input)).toContain('Consulté la agenda');
    expect(calendar.getAvailability).toHaveBeenCalledWith(expect.objectContaining({ timeMin: '2026-10-21T20:30:00.000Z' }));
  });
});
