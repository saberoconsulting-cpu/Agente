import { ConflictException, Controller, Get, Logger, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PublicRoute } from '../../security/public.decorator';
import { CurrentUser, TenantId } from '../../security/current-user.decorator';
import { Roles } from '../../security/roles.decorator';
import { AuthTokenPayload } from '../../auth/token';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOAuthTokenService } from './google-oauth-token.service';

@Controller('integrations/google')
export class GoogleIntegrationController {
  private readonly logger = new Logger(GoogleIntegrationController.name);
  constructor(
    private readonly calendar: GoogleCalendarService,
    private readonly tokens: GoogleOAuthTokenService,
    private readonly config: ConfigService,
  ) {}

  @Get('auth-url')
  @Roles('owner')
  async authUrl(@CurrentUser() user: AuthTokenPayload) {
    return { url: await this.calendar.getAuthUrl(user) };
  }

  @Roles('owner')
  @Get('start')
  async start(@Res() response: Response, @CurrentUser() user: AuthTokenPayload) {
    response.redirect(await this.calendar.getAuthUrl(user));
  }

  @Get('status')
  async status(@TenantId() companyId: string) {
    const rows = await this.tokens.inspectConnection(companyId);
    const connection = rows.find(row => !row.revoked_at);
    return { connected: Boolean(connection), scopes: connection?.scopes || [], company_id: companyId, connected_at: connection?.connected_at || null };
  }

  @Get('check')
  @Roles('owner', 'admin')
  async check(@TenantId() companyId: string) {
    const status = await this.status(companyId);
    if (!status.connected) return { ok: false, code: 'not_connected', message: 'Conecta Google con la cuenta de esta empresa antes de comprobar Calendar.' };
    try {
      const calendars = await this.calendar.listCalendars(companyId);
      const now = new Date();
      await this.calendar.getAvailability({ companyId, timeMin: now.toISOString(), timeMax: new Date(now.getTime() + 86400000).toISOString() });
      return { ok: true, code: 'available', message: 'Google Calendar respondió correctamente. Se pudo consultar la disponibilidad sin crear ni modificar citas.', calendars: calendars.length };
    } catch (error) {
      const provider = error as { response?: { status?: number; data?: { error?: string | { status?: string } } } };
      const code = provider.response?.data?.error;
      if (code === 'invalid_grant' || provider.response?.status === 401) return { ok: false, code: 'reconnect', message: 'El permiso de Google venció o fue revocado. Vuelve a conectar Google con la cuenta de esta empresa.' };
      if (provider.response?.status === 403) return { ok: false, code: 'permissions', message: 'Google denegó el acceso. Revisa que Calendar API esté habilitada, que esta cuenta pueda usar la aplicación y que hayas concedido los permisos de calendario.' };
      return { ok: false, code: 'unavailable', message: 'No se pudo comprobar el calendario configurado. Revisa los permisos, el calendario y la conexión con Google antes de grabar la demostración.' };
    }
  }

  @PublicRoute()
  @Get('callback')
  async callback(
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('state') state?: string,
  ) {
    if (error) {
      this.logger.warn(`Google OAuth callback returned error=${String(error).slice(0, 120)}`);
      return response.redirect(this.dashboardRedirectUrl('error', error));
    }

    if (!code) {
      return response.redirect(this.dashboardRedirectUrl('error', 'missing_code'));
    }

    try {
      if (!state) throw new Error('missing_state');
      await this.calendar.exchangeCodeForTokens(code, state);
      return response.redirect(this.dashboardRedirectUrl('connected'));
    } catch (tokenError) {
      const failure = tokenError as { message?: string; response?: { data?: { error?: string; error_description?: string } } };
      this.logger.warn(`Google OAuth token exchange failed: ${failure?.response?.data?.error || ''} ${failure?.response?.data?.error_description || failure?.message || ''}`.slice(0, 300));
      if (tokenError instanceof Error && tokenError.message === 'missing_calendar_permissions') {
        return response.redirect(this.dashboardRedirectUrl('error', 'no concediste los permisos de Calendar. Vuelve a conectar y deja marcadas todas las casillas'));
      }
      return response.redirect(this.dashboardRedirectUrl('error', 'token_exchange_failed'));
    }
  }

  @Get('picker-config')
  pickerConfig(@TenantId() companyId: string) {
    const clientId=this.config.get<string>('GOOGLE_CLIENT_ID')?.trim() || null;
    const developerKey=this.config.get<string>('GOOGLE_PICKER_API_KEY')?.trim() || null;
    const appId=this.config.get<string>('GOOGLE_APP_ID')?.trim() || null;
    const clientProject=clientId?.match(/^(\d+)-/)?.[1];
    return {
      company_id: companyId,
      client_id: clientId,
      developer_key: developerKey,
      app_id: appId,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      enabled: Boolean(clientId && developerKey && appId && clientProject===appId),
    };
  }

  @Get('picker-token')
  @Roles('owner', 'admin')
  async pickerToken(@TenantId() companyId: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Pragma', 'no-cache');
    const connections = await this.tokens.inspectConnection(companyId);
    const connection = connections.find(row => !row.revoked_at);
    if (!connection?.scopes?.includes('https://www.googleapis.com/auth/drive.file')) {
      throw new ConflictException('Conecta Google en Conexiones con la cuenta que contiene tus documentos y concede el permiso de Drive.');
    }
    try {
      const client = await this.tokens.getAuthorizedClient(companyId);
      const token = await client.getAccessToken();
      if (!token.token) throw new Error('missing_access_token');
      // Picker needs an access token; refresh credentials remain encrypted on the server.
      return { access_token: token.token };
    } catch (error) {
      const provider = error as { response?: { status?: number; data?: { error?: string } } };
      if (provider.response?.status === 401 || provider.response?.data?.error === 'invalid_grant') {
        throw new ConflictException('El permiso de Google venció o fue revocado. Vuelve a conectar Google en Conexiones.');
      }
      throw new ServiceUnavailableException('No se pudo obtener el permiso de Drive. Inténtalo de nuevo; si persiste, vuelve a conectar Google en Conexiones.');
    }
  }

  private dashboardRedirectUrl(status: 'connected' | 'error', reason?: string) {
    const configuredUrl =
      this.config.get<string>('AGENT_DASHBOARD_URL') ||
      this.config.get<string>('FRONTEND_BASE_URL') ||
      this.config.get<string>('FRONTEND_URL')?.split(',').map(value => value.trim()).find(Boolean) ||
      this.config.get<string>('APP_BASE_URL') ||
      'http://127.0.0.1:5173';
    const baseUrl = configuredUrl.includes('localhost:3001') || configuredUrl.includes('127.0.0.1:3001')
      ? 'http://127.0.0.1:5173'
      : configuredUrl;
    const url = new URL(baseUrl);

    url.searchParams.set('google', status);
    if (reason) url.searchParams.set('reason', reason);

    return url.toString();
  }
}
