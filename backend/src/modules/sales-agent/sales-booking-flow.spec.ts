import { SalesSchedulingService } from './sales-scheduling.service';

describe('Booking conversation with persisted state', () => {
  function setup() {
    let stored: any = {};
    const db = { query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.startsWith('select state')) return { rows: [{ state: { booking: JSON.parse(JSON.stringify(stored)) }, external_id: '51900000000' }] };
      if (sql.startsWith('update conversations')) stored = JSON.parse(params[2]);
      return { rows: [], rowCount: 1 };
    }) };
    const ai = { complete: jest.fn() };
    const calendar = {
      getAvailability: jest.fn().mockResolvedValue({ busy: [] }),
      createMeeting: jest.fn().mockResolvedValue({ id: 'meeting-1', meet_link: 'https://meet.google.com/test' }),
    };
    const config = { get: (key: string) => key === 'DEFAULT_TIMEZONE' ? 'America/Lima' : undefined };
    const service = new SalesSchedulingService(db as any, ai as any, calendar as any, config as any);
    const turn = async (message: string, decision: any = { action: 'none' }) => {
      ai.complete.mockResolvedValue({ content: JSON.stringify(decision) });
      return service.respond({ companyId: 'sabero', conversationId: 'conversation-a', leadId: 'lead-a', message });
    };
    return { turn, calendar, ai, state: () => stored };
  }
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-11-13T06:00:00Z')));
  afterEach(() => jest.useRealTimers());

  it('completes request, date, period, time, name, email and explicit confirmation without repetition', async () => {
    const s = setup();
    expect(await s.turn('quiero una reunion', { action: 'availability' })).toContain('qué día de la semana');
    expect(await s.turn('mañana')).toContain('por la mañana o por la tarde');
    expect(s.state().date).toBe('2026-11-14');
    expect(await s.turn('tarde')).toContain('¿Me confirmas qué hora');
    expect(s.calendar.getAvailability).not.toHaveBeenCalled();
    expect(await s.turn('a las 2', { action: 'select', time: '14:00' })).toContain('nombre y correo');
    const selected = s.state().pending.start;
    const nameAnswer = await s.turn('Roberto Lopez Calle');
    expect(nameAnswer).toContain('tu correo');
    expect(nameAnswer).not.toContain('tu nombre');
    expect(s.state().name).toBe('Roberto Lopez Calle');
    expect(await s.turn('mi correo roberto@example.com')).toContain('¿Confirmas');
    expect(s.state()).toMatchObject({ name: 'Roberto Lopez Calle', email: 'roberto@example.com' });
    expect(s.calendar.createMeeting).not.toHaveBeenCalled();
    expect(await s.turn('sí confirmo', { action: 'confirm' })).toContain('https://meet.google.com/test');
    expect(s.calendar.createMeeting).toHaveBeenCalledTimes(1);
    expect(s.calendar.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ start_time: selected, attendee_name: 'Roberto Lopez Calle', attendee_email: 'roberto@example.com', company_id: 'sabero' }));
    expect(s.state()).toMatchObject({ active: false, booked: { id: 'meeting-1' } });
    expect(await s.turn('sí confirmo', { action: 'confirm' })).toBeNull();
    expect(s.calendar.createMeeting).toHaveBeenCalledTimes(1);
  });

  it('retains manual contact answers even if the model becomes unavailable', async () => {
    const s = setup();
    s.calendar.getAvailability.mockRejectedValue(new Error('Calendar unavailable'));
    expect(await s.turn('reunion viernes tarde a las 3', { action: 'select', date: '2026-11-13', period: 'afternoon', time: '15:00' })).toContain('nombre');
    s.ai.complete.mockRejectedValue(new Error('AI unavailable'));
    // Captured contact answers do not depend on the provider.
    expect(await s.turn('Roberto')).toContain('correo');
    expect(await s.turn('roberto@example.com')).toContain('pendiente');
    expect(s.state()).toMatchObject({ name: 'Roberto', email: 'roberto@example.com' });
    const answer = await s.turn('reunion a las 15:00', { action: 'select', time: '15:00' });
    expect(answer).toContain('pendiente');
    expect(answer).toContain('Todavía no hay una reunión reservada ni un enlace de Meet');
    expect(answer).not.toContain('franja');
    expect(answer).not.toContain('Reunión agendada');
    expect(s.calendar.createMeeting).not.toHaveBeenCalled();
  });

  it('requires renewed confirmation after the client changes the proposed hour', async () => {
    const s = setup();
    await s.turn('horarios reunion viernes tarde', { action: 'availability', date: '2026-11-13', period: 'afternoon' });
    await s.turn('1', { action: 'select', option: 1 });
    await s.turn('Roberto');
    await s.turn('roberto@example.com');
    expect(await s.turn('sí pero a las 16', { action: 'confirm', time: '16:00' })).toContain('¿Confirmas');
    expect(s.state().pending.start).toBe('2026-11-13T21:00:00.000Z');
    expect(s.calendar.createMeeting).not.toHaveBeenCalled();
    await s.turn('sí', { action: 'confirm' });
    expect(s.calendar.createMeeting).toHaveBeenCalledWith(expect.objectContaining({ start_time: '2026-11-13T21:00:00.000Z' }));
  });

  it('never announces a booking when event creation fails', async () => {
    const s = setup();
    await s.turn('horarios reunion viernes tarde', { action: 'availability', date: '2026-11-13', period: 'afternoon' });
    await s.turn('1', { action: 'select', option: 1 });
    await s.turn('Roberto');
    await s.turn('roberto@example.com');
    s.calendar.createMeeting.mockRejectedValue(new Error('Calendar unavailable'));
    expect(await s.turn('sí confirmo', { action: 'confirm' })).toContain('No pude confirmar');
    expect(s.state().booked).toBeUndefined();
    expect(s.state().pending).toBeDefined();
  });
});
