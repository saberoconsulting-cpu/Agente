import { Module } from '@nestjs/common';
import { DeepSeekProvider } from './deepseek.provider';

@Module({
  providers: [DeepSeekProvider],
  exports: [DeepSeekProvider],
})
export class AiProvidersModule {}
