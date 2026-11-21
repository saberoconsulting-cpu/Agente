/// <reference types="jest" />
import { GoogleOAuthTokenService } from './google-oauth-token.service';

const EVENTS = 'https://www.googleapis.com/auth/calendar.events';
const FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy';
const DRIVE = 'https://www.googleapis.com/auth/drive.file';

describe('GoogleOAuthTokenService', () => {
  function setup() {
    const connections = {
      saveConnection: jest.fn().mockResolvedValue({}),
      updateTokens: jest.fn().mockResolvedValue({}),
      findActiveTokens: jest.fn().mockResolvedValue({ rowCount: 1, rows: [{ encrypted_tokens: 'enc' }] }),
    };
    const crypto = {
      encryptJson: jest.fn((value) => `enc:${JSON.stringify(value)}`),
      decryptJson: jest.fn().mockReturnValue({ access_token: 'old', refresh_token: 'refresh', expiry_date: 1 }),
    };
    const config = { get: (key: string) => ({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', GOOGLE_REDIRECT_URI: 'https://x.test/cb' } as Record<string, string>)[key] };
    return { service: new GoogleOAuthTokenService(config as any, connections as any, crypto as any), connections, crypto };
  }

  it('detects Calendar permissions the user unchecked on the consent screen', () => {
    const { service } = setup();
    expect(service.missingCalendarScopes({ scope: `${EVENTS} ${FREEBUSY} ${DRIVE}` })).toEqual([]);
    expect(service.missingCalendarScopes({ scope: `${EVENTS} ${DRIVE}` })).toEqual([FREEBUSY]);
    expect(service.missingCalendarScopes({})).toEqual([EVENTS, FREEBUSY]);
  });

  it('stores the scopes Google actually granted, not the requested ones', async () => {
    const { service, connections } = setup();
    await service.saveTokens('company-a', { scope: `${EVENTS} ${FREEBUSY}`, refresh_token: 'r' });
    expect(connections.saveConnection.mock.calls[0][1]).toEqual([EVENTS, FREEBUSY]);
  });

  it('persists refreshed access tokens and keeps the refresh token', async () => {
    const { service, connections } = setup();
    const client = await service.getAuthorizedClient('company-a');
    client.emit('tokens', { access_token: 'new', expiry_date: 99 });
    const saved = JSON.parse(String(connections.updateTokens.mock.calls[0][1]).replace(/^enc:/, ''));
    expect(connections.updateTokens.mock.calls[0][0]).toBe('company-a');
    expect(saved).toMatchObject({ access_token: 'new', refresh_token: 'refresh', expiry_date: 99 });
  });
});
