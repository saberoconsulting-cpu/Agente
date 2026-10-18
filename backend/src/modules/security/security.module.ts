import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';
import { OAuthTokenCryptoService } from './oauth-token-crypto.service';

@Module({
  providers: [
    OAuthTokenCryptoService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
  exports: [OAuthTokenCryptoService],
})
export class SecurityModule {}
