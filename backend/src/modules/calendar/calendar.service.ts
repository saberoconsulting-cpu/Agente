import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { GoogleCalendarService } from '../integrations/google/google-calendar.service';

export type CreateMeetingInput = {
  company_id?: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  timezone?: string;
  attendee_name?: string;
  attendee_email?: string;
  attendee_phone?: string;
  lead_id?: string;
  conversation_id?: string;
  idempotency_key?: string;
};

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly googleCalendar: GoogleCalendarService,
    private readonly config: ConfigService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  async getAvailability(input: { companyId: string; timeMin: string; timeMax: string }) {
    if (!input.timeMin || !input.timeMax) {
      throw new BadRequestException('time_min and time_max are required');
    }

    const availability = await this.googleCalendar.getAvailability({
      companyId: input.companyId,
      timeMin: input.timeMin,
      timeMax: input.timeMax,
      timezone: this.config.get<string>('DEFAULT_TIMEZONE') || 'America/Lima',
    });

    return {
      company_id: input.companyId,
      ...availability,
    };
  }

  async listMeetings(companyId = 'sabero') {
    const result = await this.db.query(
      `select id, title, description, attendee_name, attendee_email, attendee_phone,
              start_time, end_time, timezone, status, provider_event_id, created_at
       from meetings
       where company_id = $1
       order by start_time desc
       limit 50`,
      [companyId],
    );

    return result.rows;
  }

  async createMeeting(input: CreateMeetingInput) {
    const companyId = input.company_id || 'sabero';
    const timezone = input.timezone || this.config.get<string>('DEFAULT_TIMEZONE') || 'America/Lima';
    const calendarId = this.config.get<string>('GOOGLE_CALENDAR_ID');

    if (!calendarId) throw new BadRequestException('GOOGLE_CALENDAR_ID is required');
    if (!input.title || !input.start_time || !input.end_time) {
      throw new BadRequestException('title, start_time and end_time are required');
    }

    if (input.idempotency_key) {
      const existing = await this.db.query(
        `select *
         from meetings
         where company_id = $1 and idempotency_key = $2`,
        [companyId, input.idempotency_key],
      );
      if (existing.rowCount) return existing.rows[0];
    }

    const availability = await this.googleCalendar.getAvailability({
      companyId,
      timeMin: input.start_time,
      timeMax: input.end_time,
      timezone,
    });

    if (availability.busy.length) {
      throw new BadRequestException('Selected calendar slot is busy');
    }

    const event = await this.googleCalendar.createMeeting({
      companyId,
      calendarId,
      title: input.title,
      description: input.description,
      startTime: input.start_time,
      endTime: input.end_time,
      timezone,
      attendeeEmail: input.attendee_email,
      attendeeName: input.attendee_name,
    });

    const result = await this.db.query<{ id: string }>(
      `insert into meetings (
         company_id, lead_id, conversation_id, calendar_provider, calendar_id,
         provider_event_id, title, description, attendee_name, attendee_email,
         attendee_phone, start_time, end_time, timezone, status,
         idempotency_key, raw_response
       )
       values ($1, $2, $3, 'google', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'booked', $14, $15)
       returning *`,
      [
        companyId,
        input.lead_id || null,
        input.conversation_id || null,
        calendarId,
        event.event_id,
        input.title,
        input.description || null,
        input.attendee_name || null,
        input.attendee_email || null,
        input.attendee_phone || null,
        input.start_time,
        input.end_time,
        timezone,
        input.idempotency_key || null,
        JSON.stringify(event.raw),
      ],
    );

    const meeting = {
      ...result.rows[0],
      html_link: event.html_link,
    };

    await this.events.record({
      companyId,
      eventType: 'meeting.booked',
      aggregateType: 'meeting',
      aggregateId: meeting.id,
      payload: {
        lead_id: input.lead_id || null,
        conversation_id: input.conversation_id || null,
        start_time: input.start_time,
        end_time: input.end_time,
        attendee_email: input.attendee_email || null,
      },
    });
    await this.audit.record({
      companyId,
      action: 'meeting.booked',
      resourceType: 'meeting',
      resourceId: meeting.id,
      metadata: { provider_event_id: event.event_id },
    });

    return meeting;
  }
}
