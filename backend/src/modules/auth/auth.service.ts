import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
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
    private readonly prisma: PrismaService,
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
    const user = await this.prisma.adminUser.findFirst({ where: { id: payload.sub, active: true } });
    if (!user) throw new UnauthorizedException('Invalid session');
    return this.safeUser(this.toAdminUser(user));
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');
    const sessionRow = await this.prisma.authSession.findFirst({ where: { refreshTokenHash: this.hashToken(refreshToken), revokedAt: null, expiresAt: { gt: new Date() } } });
    const prismaUser = sessionRow ? await this.prisma.adminUser.findFirst({ where: { id: sessionRow.userId, active: true } }) : null;
    if (!sessionRow || !prismaUser) throw new UnauthorizedException('Invalid refresh token');
    const user = this.toAdminUser(prismaUser);
    const ttl = this.accessTokenTtl();
    const session = await this.rotateSession(sessionRow.id, user.id, ttl);
    const token = signToken({
      sub: user.id, email: user.email, company_id: user.company_id, role: user.role,
      sid: session.id, csrf: session.csrfToken, exp: Math.floor(Date.now() / 1000) + ttl,
    }, this.getSecret());
    return { access_token: token, expires_in: ttl, refresh_token: session.refreshToken, csrf_token: session.csrfToken, user: this.safeUser(user) };
  }

  async logout(token?: string) {
    const payload = token ? this.verifyAccessToken(token) : null;
    if (payload?.sid) await this.prisma.authSession.updateMany({ where: { id: payload.sid }, data: { revokedAt: new Date() } });
  }

  async logoutFromPayload(payload: ReturnType<AuthService['verifyAccessToken']>) {
    if (payload.sid) await this.prisma.authSession.updateMany({ where: { id: payload.sid }, data: { revokedAt: new Date() } });
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

    const user = await this.prisma.adminUser.upsert({ where: { email: input.email }, create: { companyId: input.companyId, email: input.email, passwordHash: hashPassword(input.password), role: input.role || 'admin', active: true }, update: { companyId: input.companyId, passwordHash: hashPassword(input.password), role: input.role || 'admin', active: true, updatedAt: new Date() } });
    return this.safeUser(this.toAdminUser(user));
  }

  async listUsers(requester: ReturnType<AuthService['verifyAccessToken']>) {
    const companyId = requester.company_id;

    const users = await this.prisma.adminUser.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
    return users.map((user) => this.safeUser(this.toAdminUser(user)));
  }

  async ensureBootstrapOwner(companyId: string, email: string, password: string) {
    if (password.length < 10) throw new BadRequestException('ADMIN_PASSWORD must be at least 10 characters');
    const user = await this.prisma.adminUser.upsert({ where: { email }, create: { companyId, email, passwordHash: hashPassword(password), role: 'owner', active: true }, update: { companyId, passwordHash: hashPassword(password), active: true, updatedAt: new Date() } });
    return this.safeUser(this.toAdminUser(user));
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
    const user = await this.prisma.adminUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    return user ? this.toAdminUser(user) : null;
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
    const session = await this.prisma.authSession.create({ data: { userId, refreshTokenHash: this.hashToken(refreshToken), csrfTokenHash: this.hashToken(csrfToken), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    return { id: session.id, refreshToken, csrfToken, accessTtlSeconds };
  }

  private async rotateSession(oldId: string, userId: string, accessTtlSeconds: number) {
    await this.prisma.authSession.updateMany({ where: { id: oldId }, data: { revokedAt: new Date() } });
    return this.createSession(userId, accessTtlSeconds);
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private toAdminUser(user: { id: string; companyId: string; email: string; passwordHash: string; role: string; active: boolean }): AdminUser {
    return { id: user.id, company_id: user.companyId, email: user.email, password_hash: user.passwordHash, role: user.role, active: user.active };
  }

  private accessTokenTtl() {
    const configured = Number(this.config.get<string>('AUTH_TOKEN_TTL_SECONDS') || 900);
    return Math.min(Math.max(configured, 300), 900);
  }

}
