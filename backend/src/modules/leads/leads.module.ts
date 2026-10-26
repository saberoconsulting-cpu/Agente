import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsRepository } from './repositories/leads.repository';
import { ContactWorkspaceService } from './contact-workspace.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { OpportunitiesModule } from '../opportunities/opportunities.module';
import { SalesPipelineModule } from '../sales-pipeline/sales-pipeline.module';
import { CalendarModule } from '../calendar/calendar.module';
import { GoogleIntegrationModule } from '../integrations/google/google-integration.module';
import { FollowupsModule } from '../followups/followups.module';
import { ConversationControlModule } from '../conversations/conversation-control.module';

@Module({
  imports:[WhatsappModule,OpportunitiesModule,SalesPipelineModule,CalendarModule,GoogleIntegrationModule,FollowupsModule,ConversationControlModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository,ContactWorkspaceService],
})
export class LeadsModule {}
