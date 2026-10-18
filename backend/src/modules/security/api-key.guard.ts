import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { IS_PUBLIC_ROUTE } from './public.decorator';
import { ROLES_KEY, UserRole } from './roles.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.readCookie(request, 'sabero_access')
      || request.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Authentication is required');

    const payload = this.auth.verifyAccessToken(token);
    (request as Request & { user?: unknown }).user = payload;
    // Controllers created before tenant context existed still receive company_id from
    // query/body. Override it centrally so client input can never select another tenant.
    const tenantRequest = request as Request & { query: Record<string, unknown>; body?: Record<string, unknown> };
    if (tenantRequest.query) tenantRequest.query.company_id = payload.company_id;
    if (tenantRequest.body && typeof tenantRequest.body === 'object') tenantRequest.body.company_id = payload.company_id;

    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && this.readCookie(request, 'sabero_access')) {
      const csrf = request.header('x-csrf-token');
      if (!csrf || !this.auth.validateCsrfToken(payload, csrf)) {
        throw new ForbiddenException('Invalid CSRF token');
      }
    }

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(), context.getClass(),
    ]);
    if (requiredRoles?.length && !requiredRoles.includes(payload.role as UserRole)) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }

  private readCookie(request: Request, name: string) {
    const encoded = request.headers.cookie
      ?.split(';')
      .map((item: string) => item.trim())
      .find((item: string) => item.startsWith(`${name}=`))
      ?.slice(name.length + 1);
    return encoded ? decodeURIComponent(encoded) : undefined;
  }
}
