
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { Credentials, OAuth2Client } from 'google-auth-library';
import { OAuthTokenCryptoService } from '../../security/oauth-token-crypto.service';
import { GoogleOAuthRepository } from './repositories/google-oauth.repository';

const googleScopes = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/drive.file',
];
// Sin estos dos permisos el bot no puede consultar la agenda ni crear reuniones.
const requiredCalendarScopes = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];

@Injectable()
export class GoogleOAuthTokenService {
  constructor(
    private readonly config: ConfigService,
    private readonly connections: GoogleOAuthRepository,
    private readonly crypto: OAuthTokenCryptoService,
  ) {}

  getScopes(): string[] {
    return googleScopes;
  }

  /** Permisos de Calendar que Google NO concedió (el usuario puede desmarcarlos al aceptar). */
  missingCalendarScopes(tokens: Credentials): string[] {
    const granted = new Set((tokens.scope || '').split(/\s+/).filter(Boolean));
    return requiredCalendarScopes.filter((scope) => !granted.has(scope));
  }

  createOAuthClient(): OAuth2Client {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google OAuth environment variables are required');
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  async saveTokens(companyId: string, tokens: Credentials) {
    const granted = (tokens.scope || '').split(/\s+/).filter(Boolean);
    await this.connections.saveConnection(companyId, granted.length ? granted : googleScopes, this.crypto.encryptJson(tokens));
  }

  async getAuthorizedClient(companyId: string) {
    const result = await this.connections.findActiveTokens(companyId);

    if (!result.rowCount) {
      throw new Error(`Google is not connected for company ${companyId}`);
    }

    const oauth2Client = this.createOAuthClient();

    const stored = this.crypto.decryptJson<Credentials>(result.rows[0].encrypted_tokens);
    oauth2Client.setCredentials(stored);
    // Guarda el access token renovado para no pedir uno nuevo a Google en cada operación.
    oauth2Client.on('tokens', (fresh) => {
      void this.connections
        .updateTokens(companyId, this.crypto.encryptJson({ ...stored, ...fresh, refresh_token: fresh.refresh_token || stored.refresh_token }))
        .catch(() => undefined);
    });

    return oauth2Client;
  }

  async inspectConnection(companyId: string) {
    const result = await this.connections.inspect(companyId);
    return result.rows;
  }
}
