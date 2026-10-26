import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { SalesAgentController } from './sales-agent.controller';
import { SalesAgentService } from './sales-agent.service';
import { SalesSchedulingService } from './sales-scheduling.service';
import { CalendarModule } from '../calendar/calendar.module';
import { SalesPipelineModule } from '../sales-pipeline/sales-pipeline.module';
import { ConversationControlModule } from '../conversations/conversation-control.module';

@Module({
  imports: [AiProvidersModule, RetrievalModule, CalendarModule, SalesPipelineModule, ConversationControlModule],
  controllers: [SalesAgentController],
  providers: [SalesAgentService, SalesSchedulingService],
  exports: [SalesAgentService],
})
export class SalesAgentModule {}
