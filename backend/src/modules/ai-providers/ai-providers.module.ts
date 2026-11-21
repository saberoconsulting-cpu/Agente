import { Module } from '@nestjs/common';
import { OAuthTokenCryptoService } from '../security/oauth-token-crypto.service';
import { DeepSeekProvider } from './deepseek.provider';
import { VisionController } from './vision.controller';
import { VisionService } from './vision.service';

@Module({
  controllers: [VisionController],
  providers: [DeepSeekProvider, VisionService, OAuthTokenCryptoService],
  exports: [DeepSeekProvider, VisionService],
})
export class AiProvidersModule {}
