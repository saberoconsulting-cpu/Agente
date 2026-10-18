import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

@Injectable()
export class OAuthTokenCryptoService {
  constructor(private readonly config: ConfigService) {}

  encryptJson(value: unknown): string {
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
  }

  decryptJson<T>(value: string): T {
    const [ivText, tagText, encryptedText] = value.split('.');
    if (!ivText || !tagText || !encryptedText) {
      throw new Error('Invalid encrypted token format');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey(),
      Buffer.from(ivText, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64'));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64')),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8')) as T;
  }

  private encryptionKey() {
    const secret = this.config.get<string>('OAUTH_TOKEN_ENCRYPTION_KEY');
    if (!secret || secret.length < 32) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be at least 32 characters');
    return createHash('sha256').update(secret).digest();
  }
}
