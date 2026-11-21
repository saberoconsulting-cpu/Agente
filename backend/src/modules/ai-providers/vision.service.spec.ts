/// <reference types="jest" />
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { VisionService, VISION_PLANS } from './vision.service';
import { OAuthTokenCryptoService } from '../security/oauth-token-crypto.service';

jest.mock('axios');
const post = axios.post as jest.Mock;
const jpeg = Buffer.from('fake-image');

function build(rows: { settings?: unknown; reserve?: boolean }, extra: Record<string, string> = {}) {
  const config = new ConfigService({ VISION_PROVIDER: 'anthropic', VISION_API_KEY: 'platform-key-1234567890', OAUTH_TOKEN_ENCRYPTION_KEY: 'x'.repeat(40), ...extra });
  const calls: string[] = [];
  const db = { query: jest.fn(async (sql: string) => {
    calls.push(sql);
    if (/from vision_settings/.test(sql)) return { rows: rows.settings ? [rows.settings] : [] };
    if (/insert into vision_usage\(company_id,month,platform_count\)/.test(sql)) return { rows: rows.reserve === false ? [] : [{ platform_count: 1 }] };
    return { rows: [] };
  }) };
  const service = new VisionService(config, db as any, new OAuthTokenCryptoService(config));
  return { service, db, calls };
}
const reply = { data: { content: [{ type: 'text', text: 'Camisa azul talla M' }] } };

describe('VisionService', () => {
  beforeEach(() => post.mockReset());

  it('reads an image with the platform key while the company is within its monthly limit', async () => {
    post.mockResolvedValue(reply);
    const { service } = build({ settings: { monthly_limit: 50, provider: null, api_key_encrypted: null } });
    await expect(service.describe('acme', jpeg, 'image/jpeg')).resolves.toEqual({ status: 'ok', text: 'Camisa azul talla M', source: 'platform' });
    expect(post.mock.calls[0][2].headers['x-api-key']).toBe('platform-key-1234567890');
  });

  it('does not call the provider once the monthly limit is reached', async () => {
    const { service } = build({ settings: { monthly_limit: 50, provider: null, api_key_encrypted: null }, reserve: false });
    await expect(service.describe('acme', jpeg, 'image/jpeg')).resolves.toEqual({ status: 'limit' });
    expect(post).not.toHaveBeenCalled();
  });

  it('treats a company without an allowance as limited', async () => {
    const { service } = build({});
    await expect(service.describe('acme', jpeg, 'image/jpeg')).resolves.toEqual({ status: 'limit' });
    expect(post).not.toHaveBeenCalled();
  });

  it('gives the allowance back when the provider fails', async () => {
    post.mockRejectedValue(new Error('boom'));
    const { service, calls } = build({ settings: { monthly_limit: 5, provider: null, api_key_encrypted: null } });
    await expect(service.describe('acme', jpeg, 'image/jpeg')).resolves.toEqual({ status: 'unavailable' });
    expect(calls.some(sql => /greatest\(platform_count-1,0\)/.test(sql))).toBe(true);
  });

  it('uses the company key, without the platform limit, once the company saves its own', async () => {
    post.mockResolvedValue({ data: { choices: [{ message: { content: 'Zapatos rojos' } }] } });
    const store = build({});
    const encrypted = new OAuthTokenCryptoService(new ConfigService({ OAUTH_TOKEN_ENCRYPTION_KEY: 'x'.repeat(40) })).encryptJson({ api_key: 'sk-own-1234567890123456' });
    const { service } = build({ settings: { monthly_limit: 0, provider: 'openai', api_key_encrypted: encrypted } });
    await expect(service.describe('acme', jpeg, 'image/png')).resolves.toEqual({ status: 'ok', text: 'Zapatos rojos', source: 'own' });
    expect(post.mock.calls[0][0]).toContain('openai.com');
    expect(post.mock.calls[0][2].headers.Authorization).toBe('Bearer sk-own-1234567890123456');
    expect(store.service).toBeDefined();
  });

  it('rejects unsupported files and invalid limits and keys', async () => {
    const { service } = build({});
    await expect(service.describe('acme', jpeg, 'application/pdf')).resolves.toEqual({ status: 'unavailable' });
    await expect(service.setLimit('acme', -1)).rejects.toThrow('límite');
    await expect(service.setOwnKey('acme', 'other', 'sk-1234567890123456789')).rejects.toThrow('Claude');
    await expect(service.setOwnKey('acme', 'openai', 'short')).rejects.toThrow('clave');
  });

  it('sets the monthly image allowance from the plan and rejects unknown plans', async () => {
    const { service, db } = build({});
    await service.setPlan('acme', 'standard');
    const insert = (db.query.mock.calls as unknown[][]).find(call => /insert into vision_settings\(company_id,plan,monthly_limit\)/.test(String(call[0])));
    expect(insert?.[1]).toEqual(['acme', 'standard', 80]);
    await expect(service.setPlan('acme', 'gratis')).rejects.toThrow('Plan');
    expect(VISION_PLANS.basic.price).toBe(7);
    expect(VISION_PLANS.pro.price).toBe(20);
    expect(VISION_PLANS.business).toMatchObject({ price: 32, images: 200 });
    expect(VISION_PLANS.unlimited).toMatchObject({ price: 45, unlimited: true });
  });

  it('never stores a key the provider rejects', async () => {
    post.mockRejectedValue(new Error('401'));
    const { service, db } = build({});
    await expect(service.setOwnKey('acme', 'anthropic', 'sk-ant-1234567890123456')).rejects.toThrow('rechazó');
    expect(db.query.mock.calls.some(([sql]) => /insert into vision_settings/.test(sql))).toBe(false);
  });
});
