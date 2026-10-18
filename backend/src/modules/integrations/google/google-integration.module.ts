import { Module } from '@nestjs/common';
import { OAuthTokenCryptoService } from '../../security/oauth-token-crypto.service';
import { GoogleIntegrationController } from './google-integration.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleOAuthTokenService } from './google-oauth-token.service';

@Module({
  controllers: [GoogleIntegrationController],
  providers: [GoogleCalendarService, GoogleOAuthTokenService, OAuthTokenCryptoService],
  exports: [GoogleCalendarService, GoogleOAuthTokenService],
})
export class GoogleIntegrationModule {}
