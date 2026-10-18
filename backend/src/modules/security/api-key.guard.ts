import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const expected = this.config.get<string>('SERVICE_API_KEY');
    if (!expected) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const bearer = request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (bearer) {
      const payload = this.auth.verifyAccessToken(bearer);
      (request as Request & { user?: unknown }).user = payload;
      return true;
    }

    const received = request.header('x-sabero-api-key') || request.header('x-api-key');
    if (received === expected) return true;

    throw new UnauthorizedException('Invalid or missing API key');
  }
}
