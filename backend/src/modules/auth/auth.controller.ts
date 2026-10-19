import { Body, Controller, Get, HttpException, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { PublicRoute } from '../security/public.decorator';
import { CurrentUser } from '../security/current-user.decorator';
import { Roles } from '../security/roles.decorator';
import { AuthService } from './auth.service';
import { AuthTokenPayload } from './token';

@Controller('auth')
export class AuthController {
  private readonly loginAttempts = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly auth: AuthService) {}

  @PublicRoute()
  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const key = `${request.ip}:${body.email?.toLowerCase() || ''}`;
    this.assertLoginAllowed(key);
    let session: Awaited<ReturnType<AuthService['login']>>;
    try {
      session = await this.auth.login(body.email, body.password);
      this.loginAttempts.delete(key);
    } catch (error) {
      this.recordFailedLogin(key);
      throw error;
    }
    this.setCookies(response, session.access_token, session.refresh_token, session.csrf_token, session.expires_in);
    return { user: session.user, expires_in: session.expires_in };
  }

  @Get('me')
  me(@CurrentUser() user: AuthTokenPayload) {
    return this.auth.meForPayload(user);
  }

  @Get('users')
  @Roles('owner')
  users(@CurrentUser() user: AuthTokenPayload) {
    return this.auth.listUsers(user);
  }

  @Post('users')
  @Roles('owner')
  createUser(
    @CurrentUser() requester: AuthTokenPayload,
    @Body() body: { email: string; password: string; role?: string },
  ) {
    return this.auth.createUser({
      requester,
      companyId: requester.company_id,
      email: body.email,
      password: body.password,
      role: body.role,
    });
  }

  @PublicRoute()
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.refresh(this.readCookie(request, 'sabero_refresh') || '');
    this.setCookies(response, session.access_token, session.refresh_token, session.csrf_token, session.expires_in);
    return { user: session.user, expires_in: session.expires_in };
  }

  @Post('logout')
  async logout(@CurrentUser() user: AuthTokenPayload, @Res({ passthrough: true }) response: Response) {
    await this.auth.logoutFromPayload(user);
    for (const name of ['sabero_access', 'sabero_refresh', 'sabero_csrf']) response.clearCookie(name, { path: '/' });
    return { ok: true };
  }

  private setCookies(response: Response, access: string, refresh: string, csrf: string, expiresIn: number) {
    const shared = { secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
    response.cookie('sabero_access', access, { ...shared, httpOnly: true, maxAge: expiresIn * 1000 });
    response.cookie('sabero_refresh', refresh, { ...shared, httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    response.cookie('sabero_csrf', csrf, { ...shared, httpOnly: false, maxAge: expiresIn * 1000 });
  }

  private readCookie(request: Request, name: string) {
    return request.headers.cookie?.split(';').map((part: string) => part.trim())
      .find((part: string) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  }

  private assertLoginAllowed(key: string) {
    const record = this.loginAttempts.get(key);
    if (record && record.resetAt > Date.now() && record.count >= 5) {
      throw new HttpException('Too many login attempts; try again later', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordFailedLogin(key: string) {
    const now = Date.now();
    const current = this.loginAttempts.get(key);
    const next = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + 15 * 60 * 1000 }
      : { ...current, count: current.count + 1 };
    this.loginAttempts.set(key, next);
  }
}
