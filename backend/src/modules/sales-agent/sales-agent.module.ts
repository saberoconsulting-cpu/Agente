import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { SalesAgentController } from './sales-agent.controller';
import { SalesAgentService } from './sales-agent.service';

@Module({
  imports: [AiProvidersModule, RetrievalModule],
  controllers: [SalesAgentController],
  providers: [SalesAgentService],
  exports: [SalesAgentService],
})
export class SalesAgentModule {}
