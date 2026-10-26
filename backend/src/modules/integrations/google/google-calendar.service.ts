import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
  calendarId?: string;
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
  createMeet?: boolean;
  requestId?: string;
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
    const calendarId = input.calendarId || this.calendarId();

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: input.timeMin,
        timeMax: input.timeMax,
        timeZone: input.timezone || this.config.get<string>('DEFAULT_TIMEZONE') || 'America/Lima',
        items: [{ id: calendarId }],
      },
    });

    const calendarResult = response.data.calendars?.[calendarId];
    if (!calendarResult || calendarResult.errors?.length || !Array.isArray(calendarResult.busy)) {
      throw new ServiceUnavailableException('Calendar availability could not be verified');
    }
    return {
      calendar_id: calendarId,
      busy: calendarResult.busy,
      raw: response.data,
    };
  }

  async createMeeting(input: CreateCalendarMeetingInput) {
    const calendar = await this.calendarClient(input.companyId);
    const calendarId = input.calendarId || this.calendarId();
    const timezone = input.timezone || this.config.get<string>('DEFAULT_TIMEZONE') || 'America/Lima';

    let response;
    try { response = await calendar.events.insert({
      calendarId,
      ...(input.createMeet ? {conferenceDataVersion:1}:{}),
      requestBody: {
        ...(input.createMeet && input.requestId ? {id:createHash('sha256').update(`${input.companyId}:${input.requestId}`).digest('hex')} : {}),
        summary: input.title,
        description: input.description,
        start: { dateTime: input.startTime, timeZone: timezone },
        end: { dateTime: input.endTime, timeZone: timezone },
        ...(input.createMeet?{conferenceData:{createRequest:{requestId:input.requestId||randomBytes(16).toString('hex'),conferenceSolutionKey:{type:'hangoutsMeet'}}}}:{}),
        attendees: input.attendeeEmail
          ? [{ email: input.attendeeEmail, displayName: input.attendeeName }]
          : undefined,
      },
      sendUpdates: input.attendeeEmail ? 'all' : 'none',
    }); } catch(error){
      if(input.createMeet&&input.requestId&&(error as {response?:{status?:number}}).response?.status===409){
        response=await calendar.events.get({calendarId,eventId:createHash('sha256').update(`${input.companyId}:${input.requestId}`).digest('hex')});
      }else throw error;
    }

    return {
      calendar_id: calendarId,
      event_id: response.data.id,
      html_link: response.data.htmlLink,
      meet_link: response.data.hangoutLink || response.data.conferenceData?.entryPoints?.find(entry=>entry.entryPointType==='video')?.uri || null,
      raw: response.data,
    };
  }

  async listCalendars(companyId:string){
    const calendar=await this.calendarClient(companyId);
    try {
      const response=await calendar.calendarList.list({minAccessRole:'writer',maxResults:100});
      return (response.data.items||[]).filter(item=>!!item.id).map(item=>({id:item.id!,label:item.summary||item.id!,primary:item.primary===true}));
    } catch(error){
      if((error as {response?:{status?:number}}).response?.status===403)return [{id:this.calendarId(),label:'Calendario conectado',primary:true}];
      throw error;
    }
  }

  async meetingLink(companyId:string,calendarId:string,eventId:string){
    const calendar=await this.calendarClient(companyId);
    const response=await calendar.events.get({calendarId,eventId});
    return {raw:response.data,meet_link:response.data.hangoutLink||response.data.conferenceData?.entryPoints?.find(entry=>entry.entryPointType==='video')?.uri||null};
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
