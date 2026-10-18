import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { google } from 'googleapis';
import { DatabaseService } from '../../database/database.service';
import { AuthTokenPayload } from '../../auth/token';
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
    private readonly db: DatabaseService,
  ) {}

  async getAuthUrl(user: AuthTokenPayload): Promise<string> {
    const oauth2Client = this.tokens.createOAuthClient();
    const state = randomBytes(32).toString('base64url');
    await this.db.query(
      `insert into google_oauth_states (state_hash, company_id, user_id, expires_at)
       values ($1, $2, $3, now() + interval '10 minutes')`,
      [this.hashState(state), user.company_id, user.sub],
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: this.tokens.getScopes(),
      state,
    });
  }

  async exchangeCodeForTokens(code: string, state: string) {
    const stateResult = await this.db.query<{ company_id: string }>(
      `update google_oauth_states
       set used_at = now()
       where state_hash = $1 and used_at is null and expires_at > now()
       returning company_id`,
      [this.hashState(state)],
    );
    if (!stateResult.rowCount) throw new Error('Invalid or expired OAuth state');
    const companyId = stateResult.rows[0].company_id;
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

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }
}
