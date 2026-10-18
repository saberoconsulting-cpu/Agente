import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { Credentials } from 'google-auth-library';
import { DatabaseService } from '../../database/database.service';
import { OAuthTokenCryptoService } from '../../security/oauth-token-crypto.service';

const googleScopes = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/drive.file',
];

@Injectable()
export class GoogleOAuthTokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
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
    await this.db.query(
      `insert into google_oauth_connections (
         company_id, provider_account_email, scopes, encrypted_tokens, connected_at, revoked_at
       )
       values ($1, null, $2, $3, now(), null)
       on conflict (company_id)
       do update set
         scopes = excluded.scopes,
         encrypted_tokens = excluded.encrypted_tokens,
         connected_at = now(),
         updated_at = now(),
         revoked_at = null`,
      [companyId, googleScopes, this.crypto.encryptJson(tokens)],
    );
  }

  async getAuthorizedClient(companyId: string) {
    const result = await this.db.query<{ encrypted_tokens: string }>(
      `select encrypted_tokens
       from google_oauth_connections
       where company_id = $1 and revoked_at is null`,
      [companyId],
    );

    if (!result.rowCount) {
      throw new Error(`Google is not connected for company ${companyId}`);
    }

    const oauth2Client = this.createOAuthClient();
    oauth2Client.setCredentials(this.crypto.decryptJson<Credentials>(result.rows[0].encrypted_tokens));
    return oauth2Client;
  }
}
