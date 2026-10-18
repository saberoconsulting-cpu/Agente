import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { hashPassword, verifyPassword } from './password';
import { signToken, verifyToken } from './token';

type AdminUser = {
  id: string;
  company_id: string;
  email: string;
  password_hash: string;
  role: string;
  active: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.findUserByEmail(email);
    if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const expiresInSeconds = this.accessTokenTtl();
    const session = await this.createSession(user.id, expiresInSeconds);
    const token = signToken(
      {
        sub: user.id,
        email: user.email,
        company_id: user.company_id,
        role: user.role,
        sid: session.id,
        csrf: session.csrfToken,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      },
      this.getSecret(),
    );

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      user: this.safeUser(user),
      refresh_token: session.refreshToken,
      csrf_token: session.csrfToken,
    };
  }

  async me(token: string) {
    const payload = this.verifyAccessToken(token);
    return this.meForPayload(payload);
  }

  async meForPayload(payload: ReturnType<AuthService['verifyAccessToken']>) {
    const result = await this.db.query<AdminUser>(
      `select id, company_id, email, password_hash, role, active
       from admin_users
       where id = $1 and active = true`,
      [payload.sub],
    );
    if (!result.rowCount) throw new UnauthorizedException('Invalid session');
    return this.safeUser(result.rows[0]);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    const result = await this.db.query<AdminUser & { session_id: string; expires_at: string; csrf_token_hash: string }>(
      `select u.id, u.company_id, u.email, u.password_hash, u.role, u.active,
              s.id as session_id, s.expires_at, s.csrf_token_hash
       from auth_sessions s join admin_users u on u.id = s.user_id
       where s.refresh_token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.active = true`,
      [this.hashToken(refreshToken)],
    );
    if (!result.rowCount) throw new UnauthorizedException('Invalid refresh token');
    const user = result.rows[0];
    const ttl = this.accessTokenTtl();
    const session = await this.rotateSession(user.session_id, user.id, ttl);
    const token = signToken({
      sub: user.id, email: user.email, company_id: user.company_id, role: user.role,
      sid: session.id, csrf: session.csrfToken, exp: Math.floor(Date.now() / 1000) + ttl,
    }, this.getSecret());
    return { access_token: token, expires_in: ttl, refresh_token: session.refreshToken, csrf_token: session.csrfToken, user: this.safeUser(user) };
  }

  async logout(token?: string) {
    const payload = token ? this.verifyAccessToken(token) : null;
    if (payload?.sid) await this.db.query('update auth_sessions set revoked_at = now() where id = $1', [payload.sid]);
  }

  async logoutFromPayload(payload: ReturnType<AuthService['verifyAccessToken']>) {
    if (payload.sid) await this.db.query('update auth_sessions set revoked_at = now() where id = $1', [payload.sid]);
  }

  async createUser(input: {
    requesterToken?: string;
    requester?: ReturnType<AuthService['verifyAccessToken']>;
    companyId: string;
    email: string;
    password: string;
    role?: string;
  }) {
    const requester = input.requester || this.verifyAccessToken(input.requesterToken || '');
    if (requester.role !== 'owner') {
      throw new UnauthorizedException('Only owners can create users');
    }
    if (requester.company_id !== input.companyId) {
      throw new UnauthorizedException('Cannot create users for another company');
    }
    if (!input.email || !input.password) {
      throw new BadRequestException('email and password are required');
    }
    if (input.password.length < 10) {
      throw new BadRequestException('password must be at least 10 characters');
    }

    const result = await this.db.query<AdminUser>(
      `insert into admin_users (company_id, email, password_hash, role, active)
       values ($1, $2, $3, $4, true)
       on conflict (email)
       do update set company_id = excluded.company_id,
                     password_hash = excluded.password_hash,
                     role = excluded.role,
                     active = true,
                     updated_at = now()
       returning id, company_id, email, password_hash, role, active`,
      [
        input.companyId,
        input.email,
        hashPassword(input.password),
        input.role || 'admin',
      ],
    );

    return this.safeUser(result.rows[0]);
  }

  async listUsers(requester: ReturnType<AuthService['verifyAccessToken']>) {
    const companyId = requester.company_id;

    const result = await this.db.query<AdminUser>(
      `select id, company_id, email, password_hash, role, active
       from admin_users
       where company_id = $1
       order by created_at asc`,
      [companyId],
    );
    return result.rows.map((user) => this.safeUser(user));
  }

  verifyAccessToken(token: string) {
    const payload = verifyToken(token, this.getSecret());
    if (!payload) throw new UnauthorizedException('Invalid or expired session');
    return payload;
  }

  validateCsrfToken(payload: ReturnType<AuthService['verifyAccessToken']>, token: string) {
    if (!payload.csrf) return false;
    return payload.csrf.length === token.length && timingSafeEqual(Buffer.from(payload.csrf), Buffer.from(token));
  }

  private async findUserByEmail(email: string) {
    const result = await this.db.query<AdminUser>(
      `select id, company_id, email, password_hash, role, active
       from admin_users
       where lower(email) = lower($1)`,
      [email],
    );
    return result.rows[0] || null;
  }

  private safeUser(user: AdminUser) {
    return {
      id: user.id,
      company_id: user.company_id,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }

  private getSecret() {
    const secret = this.config.get<string>('AUTH_SECRET');
    if (!secret || secret.length < 32) throw new Error('AUTH_SECRET must be at least 32 characters');
    return secret;
  }

  private async createSession(userId: string, accessTtlSeconds: number) {
    const refreshToken = randomBytes(48).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const result = await this.db.query<{ id: string }>(
      `insert into auth_sessions (user_id, refresh_token_hash, csrf_token_hash, expires_at)
       values ($1, $2, $3, now() + interval '30 days') returning id`,
      [userId, this.hashToken(refreshToken), this.hashToken(csrfToken)],
    );
    return { id: result.rows[0].id, refreshToken, csrfToken, accessTtlSeconds };
  }

  private async rotateSession(oldId: string, userId: string, accessTtlSeconds: number) {
    await this.db.query('update auth_sessions set revoked_at = now() where id = $1', [oldId]);
    return this.createSession(userId, accessTtlSeconds);
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private accessTokenTtl() {
    const configured = Number(this.config.get<string>('AUTH_TOKEN_TTL_SECONDS') || 900);
    return Math.min(Math.max(configured, 300), 900);
  }

}
