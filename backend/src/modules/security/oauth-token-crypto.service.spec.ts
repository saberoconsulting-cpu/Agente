import { OAuthTokenCryptoService } from './oauth-token-crypto.service';

describe('OAuthTokenCryptoService', () => {
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'OAUTH_TOKEN_ENCRYPTION_KEY') return 'test-encryption-key';
      return undefined;
    }),
  };

  it('encrypts and decrypts JSON without storing plaintext', () => {
    const service = new OAuthTokenCryptoService(config as any);
    const payload = { access_token: 'secret-token', refresh_token: 'refresh-secret' };

    const encrypted = service.encryptJson(payload);

    expect(encrypted).not.toContain('secret-token');
    expect(encrypted).not.toContain('refresh-secret');
    expect(service.decryptJson(encrypted)).toEqual(payload);
  });
});
