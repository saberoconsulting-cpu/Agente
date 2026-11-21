/// <reference types="jest" />
import { ConfigService } from '@nestjs/config';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ROLES_KEY } from '../../security/roles.decorator';
import { GoogleIntegrationController } from './google-integration.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOAuthTokenService } from './google-oauth-token.service';

describe('Google connection checks and callback', () => {
  function setup(values: Record<string, string> = {}) {
    const client = { getAccessToken: jest.fn(async () => ({ token: 'short-lived-access' })), credentials: { refresh_token: 'must-stay-private' } };
    const tokens = { inspectConnection: jest.fn(async () => [] as any[]), getAuthorizedClient: jest.fn(async () => client) };
    const calendar = { listCalendars: jest.fn(async () => [{ id: 'primary' }]), getAvailability: jest.fn(async () => ({ busy: [] })), exchangeCodeForTokens: jest.fn(async () => ({})) };
    const controller = new GoogleIntegrationController(calendar as unknown as GoogleCalendarService, tokens as unknown as GoogleOAuthTokenService, new ConfigService(values));
    return { controller, calendar, tokens, client };
  }

  it('reports the current company as disconnected without querying Calendar', async () => {
    const s = setup();
    expect(await s.controller.check('company-a')).toMatchObject({ ok: false, code: 'not_connected' });
    expect(s.tokens.inspectConnection).toHaveBeenCalledWith('company-a');
    expect(s.calendar.getAvailability).not.toHaveBeenCalled();
  });

  it('opens Picker with the current tenant connection and never returns refresh credentials', async () => {
    const s = setup();
    s.tokens.inspectConnection.mockResolvedValue([{ revoked_at: null, scopes: ['https://www.googleapis.com/auth/drive.file'] }]);
    const response = { setHeader: jest.fn() };
    expect(await s.controller.pickerToken('company-a', response as any)).toEqual({ access_token: 'short-lived-access' });
    expect(s.tokens.getAuthorizedClient).toHaveBeenCalledWith('company-a');
    expect(s.client.getAccessToken).toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(Reflect.getMetadata(ROLES_KEY, s.controller.pickerToken)).toEqual(['owner', 'admin']);
  });

  it.each([[], [{ revoked_at: new Date(), scopes: ['https://www.googleapis.com/auth/drive.file'] }], [{ revoked_at: null, scopes: ['calendar'] }]])('requires an active Drive permission before issuing a picker token (%j)', async (...connections) => {
    const s = setup();
    s.tokens.inspectConnection.mockResolvedValue(connections);
    await expect(s.controller.pickerToken('company-a', { setHeader: jest.fn() } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(s.tokens.getAuthorizedClient).not.toHaveBeenCalled();
  });

  it.each([
    [{ response: { data: { error: 'invalid_grant' } } }, ConflictException],
    [new Error('private provider details'), ServiceUnavailableException],
  ])('explains expired Google grants and transient failures without returning provider details', async (error, exception) => {
    const s = setup();
    s.tokens.inspectConnection.mockResolvedValue([{ revoked_at: null, scopes: ['https://www.googleapis.com/auth/drive.file'] }]);
    s.client.getAccessToken.mockRejectedValue(error);
    await expect(s.controller.pickerToken('company-a', { setHeader: jest.fn() } as any)).rejects.toBeInstanceOf(exception);
  });

  it('does not consider revoked connections active or expose token metadata', async () => {
    const s = setup();
    s.tokens.inspectConnection.mockResolvedValue([{ revoked_at: new Date(), encrypted_tokens: 'private-value' }]);
    expect(await s.controller.status('company-a')).toEqual({ connected: false, scopes: [], company_id: 'company-a', connected_at: null });
  });

  it('checks calendars and availability without creating meetings or returning event details', async () => {
    const s = setup();
    s.tokens.inspectConnection.mockResolvedValue([{ revoked_at: null, scopes: ['calendar'] }]);
    expect(await s.controller.check('company-a')).toMatchObject({ ok: true, calendars: 1 });
    expect(s.calendar.listCalendars).toHaveBeenCalledWith('company-a');
    expect(s.calendar.getAvailability).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-a', timeMin: expect.any(String), timeMax: expect.any(String) }));
  });

  it.each([
    [{ response: { status: 401 } }, 'reconnect'],
    [{ response: { data: { error: 'invalid_grant' } } }, 'reconnect'],
    [{ response: { status: 403 } }, 'permissions'],
    [new Error('private token details'), 'unavailable'],
  ])('explains connection failures without exposing provider errors', async (error, code) => {
    const s = setup();
    s.tokens.inspectConnection.mockResolvedValue([{ revoked_at: null }]);
    s.calendar.listCalendars.mockRejectedValue(error);
    const result = await s.controller.check('company-a');
    expect(result).toMatchObject({ ok: false, code });
    expect(JSON.stringify(result)).not.toContain('private token');
  });

  it.each([
    [{}, 'http://127.0.0.1:5173/'],
    [{ APP_BASE_URL: 'http://localhost:3001' }, 'http://127.0.0.1:5173/'],
    [{ FRONTEND_URL: 'http://127.0.0.1:5173,http://localhost:5173' }, 'http://127.0.0.1:5173/'],
    [{ AGENT_DASHBOARD_URL: 'https://agente.example.test' }, 'https://agente.example.test/'],
  ])('returns to the agent after OAuth instead of the CRM', async (config, expected) => {
    const s = setup(config);
    const response = { redirect: jest.fn() };
    await s.controller.callback(response as any, undefined, 'access_denied');
    const url = new URL(response.redirect.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe(expected);
    expect(url.searchParams.get('google')).toBe('error');
  });
  it('explains when the user unchecked the Calendar permissions', async () => {
    const s = setup({});
    (s.calendar.exchangeCodeForTokens as jest.Mock).mockRejectedValue(new Error('missing_calendar_permissions'));
    const response = { redirect: jest.fn() };
    await s.controller.callback(response as any, 'code', undefined, 'state');
    const url = new URL(response.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('google')).toBe('error');
    expect(url.searchParams.get('reason')).toContain('permisos de Calendar');
  });
});
