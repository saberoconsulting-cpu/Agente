import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthTokenPayload } from '../auth/token';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthTokenPayload => {
    const request = context.switchToHttp().getRequest<{ user?: AuthTokenPayload }>();
    if (!request.user) throw new Error('Authenticated user is required');
    return request.user;
  },
) as unknown as () => ParameterDecorator;

export const TenantId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<{ user?: AuthTokenPayload }>();
    if (!request.user?.company_id) throw new Error('Authenticated tenant is required');
    return request.user.company_id;
  },
) as unknown as () => ParameterDecorator;
