import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WhatsappConnectionsService } from './whatsapp-connections.service';

describe('WhatsappConnectionsService', () => {
  function createService(overrides: {
    requester?: Record<string, string>;
    query?: jest.Mock;
  } = {}) {
    const requester = overrides.requester || {
      sub: 'user-1',
      company_id: 'company-1',
      role: 'admin',
    };
    const db = {
      query: overrides.query || jest.fn().mockResolvedValue({
        rows: [{
          id: 'connection-1',
          company_id: 'company-1',
          meta_app_id: 'app-1',
          waba_id: 'waba-1',
          phone_number_id: 'phone-1',
          display_phone_number: '+51999999999',
          verified_name: 'Sabero',
          status: 'connected',
          scopes: [],
          token_type: 'bearer',
          token_expires_at: null,
          connected_at: '2026-01-01T00:00:00.000Z',
          revoked_at: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        }],
        rowCount: 1,
      }),
    };
    const auth = {
      verifyAccessToken: jest.fn().mockReturnValue(requester),
    };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          META_APP_ID: '1086951707051587',
          WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: 'config-1',
          META_GRAPH_API_VERSION: 'v25.0',
        };
        return values[key];
      }),
    };
    const audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const crypto = {
      encryptJson: jest.fn().mockReturnValue('encrypted-token'),
      decryptJson: jest.fn().mockReturnValue({ access_token: 'decrypted-token' }),
    };

    return {
      service: new WhatsappConnectionsService(db as any, config as any, auth as any, audit as any, crypto as any),
      db,
      config,
      audit,
      crypto,
    };
  }

  it('returns embedded signup public config without secrets', () => {
    const { service } = createService();

    expect(service.getEmbeddedSignupConfig('Bearer session-token')).toEqual({
      app_id: '1086951707051587',
      config_id: 'config-1',
      graph_api_version: 'v25.0',
      enabled: true,
      missing: [],
    });
  });

  it('lists only connections for the authenticated company and never selects encrypted tokens', async () => {
    const { service, db } = createService();

    await service.listForAuthorization('Bearer session-token');

    expect(db.query.mock.calls[0][0]).toContain('where company_id = $1');
    expect(db.query.mock.calls[0][0]).not.toContain('encrypted_access_token');
    expect(db.query.mock.calls[0][1]).toEqual(['company-1']);
  });

  it('requires admin role to store a connected account', async () => {
    const { service } = createService({
      requester: { sub: 'user-1', company_id: 'company-1', role: 'viewer' },
    });

    await expect(service.upsertConnected({
      authorization: 'Bearer session-token',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessToken: 'token-1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('encrypts access tokens before persistence and audits without token values', async () => {
    const { service, db, audit, crypto } = createService();

    await service.upsertConnected({
      authorization: 'Bearer session-token',
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessToken: 'plain-token',
      scopes: ['whatsapp_business_messaging'],
    });

    expect(crypto.encryptJson).toHaveBeenCalledWith(expect.objectContaining({
      access_token: 'plain-token',
    }));
    expect(db.query.mock.calls[0][1]).toContain('encrypted-token');
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('plain-token');
  });

  it('rejects incomplete connection records', async () => {
    const { service } = createService();

    await expect(service.upsertConnected({
      authorization: 'Bearer session-token',
      wabaId: '',
      phoneNumberId: 'phone-1',
      accessToken: 'token-1',
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
