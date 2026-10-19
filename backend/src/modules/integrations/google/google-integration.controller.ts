import { Controller, Get, Query, Res } from '@nestjs/common';
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

  @PublicRoute()
  @Get('callback')
  async callback(
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('state') state?: string,
  ) {
    if (error) {
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
      const reason = tokenError instanceof Error ? tokenError.message : 'token_exchange_failed';
      return response.redirect(this.dashboardRedirectUrl('error', reason));
    }
  }

  @Get('picker-config')
  pickerConfig(@TenantId() companyId: string) {
    return {
      company_id: companyId,
      client_id: this.config.get<string>('GOOGLE_CLIENT_ID') || null,
      developer_key: this.config.get<string>('GOOGLE_PICKER_API_KEY') || null,
      app_id: this.config.get<string>('GOOGLE_APP_ID') || null,
      scopes: this.tokens.getScopes(),
      enabled: Boolean(
        this.config.get<string>('GOOGLE_CLIENT_ID') &&
        this.config.get<string>('GOOGLE_PICKER_API_KEY') &&
        this.config.get<string>('GOOGLE_APP_ID'),
      ),
    };
  }

  private dashboardRedirectUrl(status: 'connected' | 'error', reason?: string) {
    const configuredUrl =
      this.config.get<string>('AGENT_DASHBOARD_URL') ||
      this.config.get<string>('FRONTEND_BASE_URL') ||
      this.config.get<string>('APP_BASE_URL') ||
      'http://127.0.0.1:5174';
    const baseUrl = configuredUrl.includes('localhost:3001') || configuredUrl.includes('127.0.0.1:3001')
      ? 'http://127.0.0.1:5174'
      : configuredUrl;
    const url = new URL(baseUrl);

    url.searchParams.set('google', status);
    if (reason) url.searchParams.set('reason', reason);

    return url.toString();
  }
}
