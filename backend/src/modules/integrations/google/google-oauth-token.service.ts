import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { Credentials } from 'google-auth-library';
import { OAuthTokenCryptoService } from '../../security/oauth-token-crypto.service';
import { GoogleOAuthRepository } from './repositories/google-oauth.repository';

const googleScopes = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/drive.file',
];

@Injectable()
export class GoogleOAuthTokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly connections: GoogleOAuthRepository,
    private readonly crypto: OAuthTokenCryptoService,
  ) {}

  getScopes() {
    return googleScopes;
  }

  createOAuthClient() {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google OAuth environment variables are required');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  async saveTokens(companyId: string, tokens: Credentials) {
    await this.connections.saveConnection(companyId, googleScopes, this.crypto.encryptJson(tokens));
  }

  async getAuthorizedClient(companyId: string) {
    const result = await this.connections.findActiveTokens(companyId);

    if (!result.rowCount) {
      throw new Error(`Google is not connected for company ${companyId}`);
    }

    const oauth2Client = this.createOAuthClient();
    oauth2Client.setCredentials(this.crypto.decryptJson<Credentials>(result.rows[0].encrypted_tokens));
    return oauth2Client;
  }

  async inspectConnection(companyId: string) {
    const result = await this.connections.inspect(companyId);
    return result.rows;
  }
}
