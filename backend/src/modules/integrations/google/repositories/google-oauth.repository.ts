import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';

@Injectable()
export class GoogleOAuthRepository {
  constructor(private readonly db: DatabaseService) {}
  saveConnection(companyId: string, scopes: string[], encryptedTokens: string) {
    return this.db.query(`insert into google_oauth_connections (company_id, provider_account_email, scopes, encrypted_tokens, connected_at, revoked_at)
      values ($1, null, $2, $3, now(), null) on conflict (company_id) do update set scopes = excluded.scopes,
      encrypted_tokens = excluded.encrypted_tokens, connected_at = now(), updated_at = now(), revoked_at = null`, [companyId, scopes, encryptedTokens]);
  }
  findActiveTokens(companyId: string) { return this.db.query<{ encrypted_tokens: string }>('select encrypted_tokens from google_oauth_connections where company_id = $1 and revoked_at is null', [companyId]); }
  inspect(companyId: string) { return this.db.query(`select company_id, provider_account_email, scopes, connected_at, revoked_at, length(encrypted_tokens) as encrypted_token_length from google_oauth_connections where company_id = $1`, [companyId]); }
}
