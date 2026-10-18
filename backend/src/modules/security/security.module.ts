import { Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { OAuthTokenCryptoService } from './oauth-token-crypto.service';

@Module({
  providers: [
    Reflector,
    OAuthTokenCryptoService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
  exports: [OAuthTokenCryptoService],
})
export class SecurityModule {}
