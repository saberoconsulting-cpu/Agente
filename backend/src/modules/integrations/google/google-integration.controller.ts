import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { PublicRoute } from '../../security/public.decorator';
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
  authUrl(@Query('company_id') companyId = 'sabero') {
    return { url: this.calendar.getAuthUrl(companyId) };
  }

  @PublicRoute()
  @Get('start')
  start(@Res() response: Response, @Query('company_id') companyId = 'sabero') {
    response.redirect(this.calendar.getAuthUrl(companyId));
  }

  @PublicRoute()
  @Get('callback')
  async callback(
    @Res() response: Response,
    @Query('code') code?: string,
    @Query('error') error?: string,
    @Query('state') companyId = 'sabero',
  ) {
    if (error) {
      return response.redirect(this.dashboardRedirectUrl(companyId, 'error', error));
    }

    if (!code) {
      return response.redirect(this.dashboardRedirectUrl(companyId, 'error', 'missing_code'));
    }

    try {
      await this.calendar.exchangeCodeForTokens(code, companyId);
      return response.redirect(this.dashboardRedirectUrl(companyId, 'connected'));
    } catch (tokenError) {
      const reason = tokenError instanceof Error ? tokenError.message : 'token_exchange_failed';
      return response.redirect(this.dashboardRedirectUrl(companyId, 'error', reason));
    }
  }

  @Get('picker-config')
  pickerConfig(@Query('company_id') companyId = 'sabero') {
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

  private dashboardRedirectUrl(companyId: string, status: 'connected' | 'error', reason?: string) {
    const configuredUrl =
      this.config.get<string>('AGENT_DASHBOARD_URL') ||
      this.config.get<string>('FRONTEND_BASE_URL') ||
      this.config.get<string>('APP_BASE_URL') ||
      'http://127.0.0.1:5174';
    const baseUrl = configuredUrl.includes('localhost:3001') || configuredUrl.includes('127.0.0.1:3001')
      ? 'http://127.0.0.1:5174'
      : configuredUrl;
    const url = new URL(baseUrl);

    url.searchParams.set('company_id', companyId);
    url.searchParams.set('google', status);
    if (reason) url.searchParams.set('reason', reason);

    return url.toString();
  }
}
