import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { OAuthTokenCryptoService } from '../security/oauth-token-crypto.service';
import { AuthTokenPayload } from '../auth/token';

export type WhatsappConnection = {
  id: string;
  company_id: string;
  meta_app_id: string | null;
  waba_id: string;
  phone_number_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  status: string;
  scopes: string[];
  token_type: string | null;
  token_expires_at: string | null;
  connected_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type StoredWhatsappConnection = WhatsappConnection & {
  encrypted_access_token: string;
};

@Injectable()
export class WhatsappConnectionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly crypto: OAuthTokenCryptoService,
  ) {}

  getEmbeddedSignupConfig(authorization: string | AuthTokenPayload | undefined) {
    this.requester(authorization);
    const appId = this.metaAppId();
    const configId = this.config.get<string>('WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID')
      || this.config.get<string>('META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID');

    return {
      app_id: appId,
      config_id: configId || null,
      graph_api_version: this.graphVersion(),
      enabled: Boolean(appId && configId),
      missing: [
        appId ? null : 'META_APP_ID',
        configId ? null : 'WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID',
      ].filter(Boolean),
    };
  }

  async listForAuthorization(authorization: string | AuthTokenPayload | undefined) {
    const requester = this.requester(authorization);
    const result = await this.db.query<WhatsappConnection>(
      `select id, company_id, meta_app_id, waba_id, phone_number_id,
              display_phone_number, verified_name, status, scopes, token_type,
              token_expires_at, connected_at, revoked_at, created_at, updated_at
       from whatsapp_connections
       where company_id = $1
       order by created_at desc`,
      [requester.company_id],
    );
    return result.rows;
  }

  async upsertConnected(input: {
    authorization?: string | AuthTokenPayload;
    metaAppId?: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    accessToken: string;
    scopes?: string[];
    tokenType?: string;
    tokenExpiresAt?: string;
  }) {
    const requester = this.requester(input.authorization);
    this.assertAdmin(requester.role);

    if (!input.wabaId || !input.phoneNumberId || !input.accessToken) {
      throw new BadRequestException('waba_id, phone_number_id and access_token are required');
    }

    const encryptedToken = this.crypto.encryptJson({
      access_token: input.accessToken,
      stored_at: new Date().toISOString(),
    });

    const result = await this.db.query<WhatsappConnection>(
      `insert into whatsapp_connections (
         company_id, meta_app_id, waba_id, phone_number_id, display_phone_number,
         verified_name, encrypted_access_token, scopes, token_type, token_expires_at,
         status, connected_at, revoked_at
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'connected', now(), null)
       on conflict (company_id, phone_number_id)
       do update set
         meta_app_id = excluded.meta_app_id,
         waba_id = excluded.waba_id,
         display_phone_number = excluded.display_phone_number,
         verified_name = excluded.verified_name,
         encrypted_access_token = excluded.encrypted_access_token,
         scopes = excluded.scopes,
         token_type = excluded.token_type,
         token_expires_at = excluded.token_expires_at,
         status = 'connected',
         connected_at = now(),
         revoked_at = null,
         disconnect_reason = null,
         updated_at = now()
       returning id, company_id, meta_app_id, waba_id, phone_number_id,
                 display_phone_number, verified_name, status, scopes, token_type,
                 token_expires_at, connected_at, revoked_at, created_at, updated_at`,
      [
        requester.company_id,
        input.metaAppId || null,
        input.wabaId,
        input.phoneNumberId,
        input.displayPhoneNumber || null,
        input.verifiedName || null,
        encryptedToken,
        input.scopes || [],
        input.tokenType || null,
        input.tokenExpiresAt || null,
      ],
    );

    const connection = result.rows[0];
    await this.audit.record({
      companyId: requester.company_id,
      actorType: 'admin_user',
      actorId: requester.sub,
      action: 'whatsapp.connection.connected',
      resourceType: 'whatsapp_connection',
      resourceId: connection.id,
      metadata: {
        waba_id: connection.waba_id,
        phone_number_id: connection.phone_number_id,
        status: connection.status,
      },
    });

    return connection;
  }

  async completeEmbeddedSignup(input: {
    authorization?: string | AuthTokenPayload;
    code: string;
    wabaId?: string;
    phoneNumberId?: string;
  }) {
    const requester = this.requester(input.authorization);
    this.assertAdmin(requester.role);

    if (!input.code) throw new BadRequestException('authorization code is required');

    const token = await this.exchangeCode(input.code);
    const scopes = await this.inspectToken(token.access_token);
    this.assertRequiredScopes(scopes);

    const resolved = await this.resolveWhatsAppAssets({
      accessToken: token.access_token,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
    });

    await this.subscribeApp(resolved.wabaId, token.access_token);

    return this.upsertConnected({
      authorization: input.authorization,
      metaAppId: this.metaAppId(),
      wabaId: resolved.wabaId,
      phoneNumberId: resolved.phoneNumberId,
      displayPhoneNumber: resolved.displayPhoneNumber || undefined,
      verifiedName: resolved.verifiedName || undefined,
      accessToken: token.access_token,
      scopes,
      tokenType: token.token_type || 'bearer',
      tokenExpiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : undefined,
    });
  }

  async revoke(authorization: string | AuthTokenPayload | undefined, id: string, reason?: string) {
    const requester = this.requester(authorization);
    this.assertAdmin(requester.role);

    const result = await this.db.query<WhatsappConnection>(
      `update whatsapp_connections
       set status = 'revoked',
           revoked_at = now(),
           disconnect_reason = $3,
           updated_at = now()
       where id = $1 and company_id = $2
       returning id, company_id, meta_app_id, waba_id, phone_number_id,
                 display_phone_number, verified_name, status, scopes, token_type,
                 token_expires_at, connected_at, revoked_at, created_at, updated_at`,
      [id, requester.company_id, reason || null],
    );

    if (!result.rowCount) throw new NotFoundException('WhatsApp connection not found');

    await this.audit.record({
      companyId: requester.company_id,
      actorType: 'admin_user',
      actorId: requester.sub,
      action: 'whatsapp.connection.revoked',
      resourceType: 'whatsapp_connection',
      resourceId: id,
      metadata: { reason: reason || null },
    });

    return result.rows[0];
  }

  async findActiveByPhoneNumberId(phoneNumberId: string) {
    const result = await this.db.query<StoredWhatsappConnection>(
      `select *
       from whatsapp_connections
       where phone_number_id = $1 and status = 'connected' and revoked_at is null
       limit 1`,
      [phoneNumberId],
    );
    return result.rows[0] || null;
  }

  async findActiveForCompany(companyId: string) {
    const result = await this.db.query<StoredWhatsappConnection>(
      `select *
       from whatsapp_connections
       where company_id = $1 and status = 'connected' and revoked_at is null
       order by connected_at desc
       limit 1`,
      [companyId],
    );
    return result.rows[0] || null;
  }

  decryptAccessToken(connection: StoredWhatsappConnection) {
    const payload = this.crypto.decryptJson<{ access_token?: string }>(connection.encrypted_access_token);
    if (!payload.access_token) throw new Error('WhatsApp connection token is invalid');
    return payload.access_token;
  }

  private requester(authorization: string | AuthTokenPayload | undefined) {
    if (authorization && typeof authorization !== 'string') return authorization;
    const token = authorization?.replace(/^Bearer\s+/i, '') || '';
    return this.auth.verifyAccessToken(token);
  }

  private assertAdmin(role: string) {
    if (role !== 'owner' && role !== 'admin') {
      throw new UnauthorizedException('Only admins can manage WhatsApp connections');
    }
  }

  private async exchangeCode(code: string) {
    const clientId = this.metaAppId();
    const clientSecret = this.config.get<string>('META_APP_SECRET');
    if (!clientId || !clientSecret) {
      throw new BadRequestException('Meta app credentials are not configured');
    }

    try {
      const response = await axios.get<{
        access_token?: string;
        token_type?: string;
        expires_in?: number;
      }>(`https://graph.facebook.com/${this.graphVersion()}/oauth/access_token`, {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          code,
        },
        timeout: 15000,
      });

      if (!response.data.access_token) {
        throw new BadRequestException('Meta did not return an access token');
      }

      return {
        access_token: response.data.access_token,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
      };
    } catch (error) {
      throw this.metaRequestError(error, 'Could not exchange Meta authorization code');
    }
  }

  private async inspectToken(accessToken: string) {
    try {
      const response = await axios.get<{
        data?: {
          is_valid?: boolean;
          scopes?: string[];
        };
      }>(`https://graph.facebook.com/${this.graphVersion()}/debug_token`, {
        params: {
          input_token: accessToken,
          access_token: `${this.metaAppId()}|${this.config.get<string>('META_APP_SECRET') || ''}`,
        },
        timeout: 15000,
      });

      if (!response.data.data?.is_valid) {
        throw new BadRequestException('Meta token is not valid');
      }

      return response.data.data.scopes || [];
    } catch (error) {
      throw this.metaRequestError(error, 'Could not validate Meta token');
    }
  }

  private assertRequiredScopes(scopes: string[]) {
    const required = ['whatsapp_business_management', 'whatsapp_business_messaging'];
    const missing = required.filter((scope) => !scopes.includes(scope));
    if (missing.length) {
      throw new BadRequestException(`Meta token is missing required permissions: ${missing.join(', ')}`);
    }
  }

  private async resolveWhatsAppAssets(input: {
    accessToken: string;
    wabaId?: string;
    phoneNumberId?: string;
  }) {
    if (!input.wabaId || !input.phoneNumberId) {
      throw new BadRequestException('waba_id and phone_number_id are required from Embedded Signup');
    }

    const phone = await this.fetchPhoneNumber(input.phoneNumberId, input.accessToken);
    await this.fetchWaba(input.wabaId, input.accessToken);

    return {
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
    };
  }

  private async fetchPhoneNumber(phoneNumberId: string, accessToken: string) {
    try {
      const response = await axios.get<{
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
      }>(`https://graph.facebook.com/${this.graphVersion()}/${phoneNumberId}`, {
        params: {
          fields: 'id,display_phone_number,verified_name',
          access_token: accessToken,
        },
        timeout: 15000,
      });

      if (response.data.id !== phoneNumberId) {
        throw new BadRequestException('Meta phone number validation failed');
      }

      return response.data;
    } catch (error) {
      throw this.metaRequestError(error, 'Could not validate WhatsApp phone number');
    }
  }

  private async fetchWaba(wabaId: string, accessToken: string) {
    try {
      const response = await axios.get<{ id?: string }>(
        `https://graph.facebook.com/${this.graphVersion()}/${wabaId}`,
        {
          params: {
            fields: 'id,name',
            access_token: accessToken,
          },
          timeout: 15000,
        },
      );

      if (response.data.id !== wabaId) {
        throw new BadRequestException('Meta WABA validation failed');
      }
    } catch (error) {
      throw this.metaRequestError(error, 'Could not validate WhatsApp Business Account');
    }
  }

  private async subscribeApp(wabaId: string, accessToken: string) {
    try {
      await axios.post(
        `https://graph.facebook.com/${this.graphVersion()}/${wabaId}/subscribed_apps`,
        null,
        {
          params: { access_token: accessToken },
          timeout: 15000,
        },
      );
    } catch (error) {
      throw this.metaRequestError(error, 'Could not subscribe app to WhatsApp Business Account');
    }
  }

  private metaRequestError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message;
      return new BadRequestException(message || fallback);
    }
    if (error instanceof BadRequestException) return error;
    return new BadRequestException(fallback);
  }

  private metaAppId() {
    return this.config.get<string>('META_APP_ID')
      || this.config.get<string>('FACEBOOK_APP_ID')
      || '1086951707051587';
  }

  private graphVersion() {
    return this.config.get<string>('META_GRAPH_API_VERSION') || 'v25.0';
  }
}
