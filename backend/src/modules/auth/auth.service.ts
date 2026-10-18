import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

    const expiresInSeconds = Number(this.config.get<string>('AUTH_TOKEN_TTL_SECONDS') || 43200);
    const token = signToken(
      {
        sub: user.id,
        email: user.email,
        company_id: user.company_id,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      },
      this.getSecret(),
    );

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresInSeconds,
      user: this.safeUser(user),
    };
  }

  async me(token: string) {
    const payload = this.verifyAccessToken(token);
    const result = await this.db.query<AdminUser>(
      `select id, company_id, email, password_hash, role, active
       from admin_users
       where id = $1 and active = true`,
      [payload.sub],
    );
    if (!result.rowCount) throw new UnauthorizedException('Invalid session');
    return this.safeUser(result.rows[0]);
  }

  async createUser(input: {
    requesterToken: string;
    companyId: string;
    email: string;
    password: string;
    role?: string;
  }) {
    const requester = this.verifyAccessToken(input.requesterToken);
    if (requester.role !== 'owner' && requester.role !== 'admin') {
      throw new UnauthorizedException('Only admins can create users');
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

  async listUsers(requesterToken: string, companyId: string) {
    const requester = this.verifyAccessToken(requesterToken);
    if (requester.company_id !== companyId) {
      throw new UnauthorizedException('Cannot list users for another company');
    }

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
    const secret = this.config.get<string>('AUTH_SECRET') || this.config.get<string>('SERVICE_API_KEY');
    if (!secret) throw new Error('AUTH_SECRET or SERVICE_API_KEY is required');
    return secret;
  }
}
