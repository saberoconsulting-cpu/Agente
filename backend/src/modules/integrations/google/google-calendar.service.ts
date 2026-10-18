import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { GoogleOAuthTokenService } from './google-oauth-token.service';

export type CalendarAvailabilityInput = {
  companyId: string;
  timeMin: string;
  timeMax: string;
  timezone?: string;
};

export type CreateCalendarMeetingInput = {
  companyId: string;
  calendarId?: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  attendeeEmail?: string;
  attendeeName?: string;
};

@Injectable()
export class GoogleCalendarService {
  constructor(
    private readonly tokens: GoogleOAuthTokenService,
    private readonly config: ConfigService,
  ) {}

  getAuthUrl(companyId = 'sabero'): string {
    const oauth2Client = this.tokens.createOAuthClient();

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.tokens.getScopes(),
      state: companyId,
    });
  }

  async exchangeCodeForTokens(code: string, companyId = 'sabero') {
    const oauth2Client = this.tokens.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    await this.tokens.saveTokens(companyId, tokens);
    return tokens;
  }

  async getAvailability(input: CalendarAvailabilityInput) {
    const calendar = await this.calendarClient(input.companyId);
    const calendarId = this.calendarId();

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        timeZone: input.timezone || this.config.get<string>('DEFAULT_TIMEZONE') || 'America/Lima',
        items: [{ id: calendarId }],
      },
    });

    return {
      calendar_id: calendarId,
      busy: response.data.calendars?.[calendarId]?.busy || [],
      raw: response.data,
    };
  }

  async createMeeting(input: CreateCalendarMeetingInput) {
    const calendar = await this.calendarClient(input.companyId);
    const calendarId = input.calendarId || this.calendarId();
    const timezone = input.timezone || this.config.get<string>('DEFAULT_TIMEZONE') || 'America/Lima';

    const response = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: input.title,
        description: input.description,
        start: { dateTime: input.startTime, timeZone: timezone },
        end: { dateTime: input.endTime, timeZone: timezone },
        attendees: input.attendeeEmail
          ? [{ email: input.attendeeEmail, displayName: input.attendeeName }]
          : undefined,
      },
      sendUpdates: input.attendeeEmail ? 'all' : 'none',
    });

    return {
      calendar_id: calendarId,
      event_id: response.data.id,
      html_link: response.data.htmlLink,
      raw: response.data,
    };
  }

  private async calendarClient(companyId: string) {
    return google.calendar({
      version: 'v3',
      auth: await this.tokens.getAuthorizedClient(companyId),
    });
  }

  private calendarId() {
    const calendarId = this.config.get<string>('GOOGLE_CALENDAR_ID');
    if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID is required');
    return calendarId;
  }
}
