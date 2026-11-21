import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { TenantInterceptor } from '../tenancy/tenant.interceptor';
import { ApiKeyGuard } from './api-key.guard';
import { OAuthTokenCryptoService } from './oauth-token-crypto.service';

@Module({
  providers: [
    OAuthTokenCryptoService,
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
  exports: [OAuthTokenCryptoService],
})
export class SecurityModule {}
