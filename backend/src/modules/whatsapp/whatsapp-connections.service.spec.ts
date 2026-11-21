/// <reference types="jest" />
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { WhatsappConnectionsService } from './whatsapp-connections.service';
import axios from 'axios';
import { tenantContext } from '../tenancy/tenant-context';

describe('WhatsappConnectionsService', () => {
  afterEach(() => jest.restoreAllMocks());
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
      conversationLock: jest.fn(async (_company: string, _key: string, work: () => Promise<unknown>) => work()),
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
          META_APP_SECRET: 'test-secret',
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
      server_configured: false,
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

  it('does not enable signup without the server app secret', () => {
    const { service, config } = createService();
    config.get.mockImplementation((key: string) => ({ META_APP_ID: 'app', WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: 'config' } as Record<string,string>)[key]);
    expect(service.getEmbeddedSignupConfig('Bearer session')).toMatchObject({ enabled: false, missing: ['META_APP_SECRET'] });
  });

  it('does not let other companies fall back to server credentials without an explicit platform owner', () => {
    const { service } = createService();
    expect(service.serverNumberAllowed('company-1')).toBe(false);
    expect(service.serverNumberAllowed('sabero')).toBe(true);
  });

  it('rejects a token issued for another Meta app', async () => {
    const { service } = createService();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { data: { is_valid: true, app_id: 'other-app', scopes: [] } } });
    await expect((service as any).inspectToken('token')).rejects.toThrow('another application');
  });

  it('checks phone membership using the WABA and follows pagination', async () => {
    const { service } = createService();
    const get = jest.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { data: [{ id: 'other-phone' }], paging: { next: 'untrusted-url', cursors: { after: 'page-2' } } } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'phone-1' }] } });
    await expect((service as any).assertPhoneBelongsToWaba('waba-1', 'phone-1', 'token')).resolves.toBeUndefined();
    expect(get.mock.calls[1][0]).toBe('https://graph.facebook.com/v25.0/waba-1/phone_numbers');
    expect(get.mock.calls[1][1]).toMatchObject({ params: { after: 'page-2' } });
  });

  it('rejects a phone that does not belong to the selected WABA', async () => {
    const { service } = createService();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { data: [{ id: 'other-phone' }] } });
    await expect((service as any).assertPhoneBelongsToWaba('waba-1', 'phone-1', 'token')).rejects.toThrow('does not belong');
  });

  it('finds an inbound connection in the tenant database and restores the caller context', async () => {
    const tenants = { defaultCompanyId: 'sabero', activeCompanyIds: jest.fn().mockResolvedValue(['client']), ensure: jest.fn().mockResolvedValue(undefined) };
    const db = { query: jest.fn(async () => ({ rows: tenantContext.getStore()?.companyId === 'client' ? [{ company_id: 'client', phone_number_id: 'phone' }] : [] })) };
    const service = new WhatsappConnectionsService(db as any, {} as any, {} as any, {} as any, {} as any, tenants as any);
    await tenantContext.run({ companyId: 'caller' }, async () => {
      await expect(service.findActiveByPhoneNumberId('phone')).resolves.toMatchObject({ company_id: 'client' });
      expect(tenantContext.getStore()?.companyId).toBe('caller');
    });
    expect(tenants.ensure.mock.calls).toEqual([['sabero'], ['client']]);
  });

  it('refuses ambiguous inbound routing when two companies have the same phone', async () => {
    const tenants = { defaultCompanyId: 'sabero', activeCompanyIds: jest.fn().mockResolvedValue(['client']), ensure: jest.fn().mockResolvedValue(undefined) };
    const db = { query: jest.fn(async () => ({ rows: [{ company_id: tenantContext.getStore()?.companyId }] })) };
    const service = new WhatsappConnectionsService(db as any, {} as any, {} as any, {} as any, {} as any, tenants as any);
    await expect(service.findActiveByPhoneNumberId('phone')).rejects.toThrow('multiple companies');
  });

  it('completes signup with server-side code exchange and stores the authenticated company', async () => {
    const { service, db, crypto } = createService();
    jest.spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { access_token: 'tenant-access', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { data: { is_valid: true, app_id: '1086951707051587', scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'] } } })
      .mockResolvedValueOnce({ data: { id: 'phone-1', display_phone_number: '+51999999999', status: 'CONNECTED', is_on_biz_app: false } })
      .mockResolvedValueOnce({ data: { id: 'waba-1' } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'phone-1' }] } });
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true } });
    jest.spyOn(service, 'findActiveByPhoneNumberId').mockResolvedValue(null);
    await service.completeEmbeddedSignup({ authorization: 'Bearer session', code: 'one-time-code', wabaId: 'waba-1', phoneNumberId: 'phone-1' });
    expect(post).toHaveBeenCalledWith('https://graph.facebook.com/v25.0/waba-1/subscribed_apps', null, expect.any(Object));
    expect(db.query.mock.calls[0][1][0]).toBe('company-1');
    expect(db.query.mock.calls[0][1][10]).toBe('connected');
    expect(crypto.encryptJson).toHaveBeenCalledWith(expect.objectContaining({ access_token: 'tenant-access' }));
  });

  it('does not subscribe or persist a phone already linked to another company', async () => {
    const { service, db } = createService();
    jest.spyOn(service as any, 'exchangeCode').mockResolvedValue({ access_token: 'token' });
    jest.spyOn(service as any, 'inspectToken').mockResolvedValue(['whatsapp_business_management', 'whatsapp_business_messaging']);
    jest.spyOn(service as any, 'resolveWhatsAppAssets').mockResolvedValue({ wabaId: 'waba-1', phoneNumberId: 'phone-1' });
    jest.spyOn(service, 'findActiveByPhoneNumberId').mockResolvedValue({ company_id: 'another-company' } as any);
    const post = jest.spyOn(axios, 'post');
    await expect(service.completeEmbeddedSignup({ authorization: 'Bearer session', code: 'code' })).rejects.toThrow('another company');
    expect(post).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  function registrationService() {
    const setup = createService();
    jest.spyOn(setup.service as any, 'inspectToken').mockResolvedValue(['whatsapp_business_management', 'whatsapp_business_messaging']);
    jest.spyOn(setup.service as any, 'assertPhoneBelongsToWaba').mockResolvedValue(undefined);
    jest.spyOn(setup.service, 'findActiveByPhoneNumberId').mockResolvedValue(null);
    return { ...setup, user: { sub: 'owner', company_id: 'company-1', role: 'owner' } as any };
  }

  it('registers a new number with the owner PIN before activating it locally', async () => {
    const { service, db, user, audit } = registrationService();
    const get = jest.spyOn(service as any, 'fetchPhoneNumber')
      .mockResolvedValueOnce({ id: 'phone-1', status: 'PENDING', is_on_biz_app: false })
      .mockResolvedValueOnce({ id: 'phone-1', status: 'CONNECTED', is_on_biz_app: false });
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true } });
    await service.registerPhone(user, 'connection-1', '012345');
    expect(post.mock.calls[0]).toEqual(['https://graph.facebook.com/v25.0/phone-1/register',
      { messaging_product: 'whatsapp', pin: '012345' }, expect.objectContaining({ headers: { Authorization: 'Bearer decrypted-token' } })]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls.at(-1)?.[1]).toEqual(['connection-1', 'company-1']);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('012345');
  });

  it.each(['12345', '1234567', '12a456', 123456, null])('rejects malformed PIN %p before reading a connection', async pin => {
    const { service, db, user } = registrationService();
    await expect(service.registerPhone(user, 'connection-1', pin)).rejects.toThrow('seis dígitos');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not expose or activate another company connection', async () => {
    const { service, db, user } = registrationService();
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const post = jest.spyOn(axios, 'post');
    await expect(service.registerPhone(user, 'foreign-id', '123456')).rejects.toThrow('not found');
    expect(db.query.mock.calls[0][1]).toEqual(['foreign-id', 'company-1']);
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'CONNECTED', is_on_biz_app: false },
    { status: 'CONNECTED', is_on_biz_app: true, platform_type: 'CLOUD_API' },
  ])('does not re-register a number already active in Meta: %p', async phone => {
    const { service, user } = registrationService();
    jest.spyOn(service as any, 'fetchPhoneNumber').mockResolvedValue(phone);
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true } });
    await service.registerPhone(user, 'connection-1');
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toContain('/subscribed_apps');
  });

  it.each([{ is_on_biz_app: true, platform_type: 'NOT_READY' }, {}])('never registers an unconfirmed or Business-app number: %p', async phone => {
    const { service, db, user } = registrationService();
    jest.spyOn(service as any, 'fetchPhoneNumber').mockResolvedValue(phone);
    const post = jest.spyOn(axios, 'post');
    await expect(service.registerPhone(user, 'connection-1', '123456')).rejects.toThrow('tipo de número');
    expect(post).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(call => String(call[0]).includes('update whatsapp_connections'))).toBe(false);
  });

  it('keeps registration pending when Meta rejects the PIN and does not echo provider secrets', async () => {
    const { service, db, user } = registrationService();
    jest.spyOn(service as any, 'fetchPhoneNumber').mockResolvedValue({ status: 'PENDING', is_on_biz_app: false });
    jest.spyOn(axios, 'post').mockRejectedValue({ response: { data: { error: { message: 'PIN 012345 token secret' } } } });
    await expect(service.registerPhone(user, 'connection-1', '012345')).rejects.toThrow('La conexión sigue pendiente');
    expect(db.query.mock.calls.some(call => String(call[0]).includes('update whatsapp_connections'))).toBe(false);
  });

  it('requires confirmation from Meta after /register success before activating locally', async () => {
    const { service, db, user } = registrationService();
    jest.spyOn(service as any, 'fetchPhoneNumber').mockResolvedValue({ status: 'PENDING', is_on_biz_app: false });
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true } });
    await expect(service.registerPhone(user, 'connection-1', '012345')).rejects.toThrow('procesando');
    expect(db.query.mock.calls.some(call => String(call[0]).includes('update whatsapp_connections'))).toBe(false);
  });

  it('stores new-number authorization as pending without calling /register or choosing a PIN', async () => {
    const { service, db } = createService();
    jest.spyOn(service as any, 'exchangeCode').mockResolvedValue({ access_token: 'token' });
    jest.spyOn(service as any, 'inspectToken').mockResolvedValue(['whatsapp_business_management', 'whatsapp_business_messaging']);
    jest.spyOn(service as any, 'resolveWhatsAppAssets').mockResolvedValue({ wabaId: 'waba-1', phoneNumberId: 'phone-1', phone: { status: 'PENDING', is_on_biz_app: false } });
    jest.spyOn(service, 'findActiveByPhoneNumberId').mockResolvedValue(null);
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: true } });
    await service.completeEmbeddedSignup({ authorization: 'Bearer session', code: 'code' });
    expect(db.query.mock.calls[0][1][10]).toBe('pending');
    expect(post.mock.calls.every(call => !String(call[0]).endsWith('/register'))).toBe(true);
  });

  it('does not report a completed connection when Meta rejects the webhook subscription', async () => {
    const { service } = createService();
    jest.spyOn(axios, 'post').mockResolvedValue({ data: { success: false } });
    await expect((service as any).subscribeApp('waba-1', 'token')).rejects.toThrow('did not confirm');
  });
});
