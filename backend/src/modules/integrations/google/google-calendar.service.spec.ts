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

  it('creates Google Meet only when the contact operation explicitly requests it',async()=>{
    const service=new GoogleCalendarService({} as any,{get:()=> 'primary'} as any,{} as any);
    const insert=jest.fn().mockResolvedValue({data:{id:'event',hangoutLink:'https://meet.google.com/test-link',htmlLink:'https://calendar.google.com/event'}});
    jest.spyOn(service as any,'calendarClient').mockResolvedValue({events:{insert}});
    const input={companyId:'company-a',title:'Reunión',startTime:'2026-11-02T14:00:00Z',endTime:'2026-11-02T14:30:00Z'};
    const result=await service.createMeeting({...input,createMeet:true,requestId:'request-a'});
    expect(insert.mock.calls[0][0]).toMatchObject({conferenceDataVersion:1,requestBody:{conferenceData:{createRequest:{requestId:'request-a',conferenceSolutionKey:{type:'hangoutsMeet'}}}}});
    expect(result.meet_link).toBe('https://meet.google.com/test-link');
    await service.createMeeting(input);
    expect(insert.mock.calls[1][0].requestBody.conferenceData).toBeUndefined();
  });
  it('recovers the same Meet event on an idempotent provider conflict',async()=>{
    const service=new GoogleCalendarService({} as any,{get:()=> 'primary'} as any,{} as any);
    const insert=jest.fn().mockRejectedValue({response:{status:409}});
    const get=jest.fn().mockResolvedValue({data:{id:'existing-event',hangoutLink:'https://meet.google.com/existing'}});
    jest.spyOn(service as any,'calendarClient').mockResolvedValue({events:{insert,get}});
    const result=await service.createMeeting({companyId:'company-a',title:'Reunión',startTime:'2026-11-02T14:00:00Z',endTime:'2026-11-02T14:30:00Z',createMeet:true,requestId:'stable-key'});
    expect(result.event_id).toBe('existing-event');expect(insert).toHaveBeenCalledTimes(1);expect(get).toHaveBeenCalledWith({calendarId:'primary',eventId:expect.stringMatching(/^[a-f0-9]{64}$/)});
  });
});
