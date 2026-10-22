import { GoogleCalendarService } from './google-calendar.service';

describe('GoogleCalendarService availability', () => {
  it.each([
    { calendars: {} },
    { calendars: { primary: { errors: [{ reason: 'notFound' }] } } },
  ])('rejects unavailable calendars instead of reporting free time', async data => {
    const service = new GoogleCalendarService({} as any, { get: () => 'primary' } as any, {} as any);
    jest.spyOn(service as any, 'calendarClient').mockResolvedValue({ freebusy: { query: jest.fn().mockResolvedValue({ data }) } });
    await expect(service.getAvailability({ companyId: 'sabero', timeMin: '2026-10-22T14:00:00Z', timeMax: '2026-10-22T15:00:00Z' })).rejects.toThrow('could not be verified');
  });
});
