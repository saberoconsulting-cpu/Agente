import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai-providers/ai-providers.module';
import { RetrievalModule } from '../retrieval/retrieval.module';
import { SalesAgentController } from './sales-agent.controller';
import { SalesAgentService } from './sales-agent.service';
import { SalesSchedulingService } from './sales-scheduling.service';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [AiProvidersModule, RetrievalModule, CalendarModule],
  controllers: [SalesAgentController],
  providers: [SalesAgentService, SalesSchedulingService],
  exports: [SalesAgentService],
})
export class SalesAgentModule {}
