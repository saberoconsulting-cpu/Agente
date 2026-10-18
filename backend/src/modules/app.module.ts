import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentSettingsModule } from './agent-settings/agent-settings.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CalendarModule } from './calendar/calendar.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EventsModule } from './events/events.module';
import { FollowupsModule } from './followups/followups.module';
import { HealthController } from './health/health.controller';
import { LeadsModule } from './leads/leads.module';
import { DatabaseModule } from './database/database.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { AiProvidersModule } from './ai-providers/ai-providers.module';
import { GoogleDriveModule } from './google-drive/google-drive.module';
import { GoogleIntegrationModule } from './integrations/google/google-integration.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { RetrievalModule } from './retrieval/retrieval.module';
import { SecurityModule } from './security/security.module';
import { SyncModule } from './sync/sync.module';
import { SalesAgentModule } from './sales-agent/sales-agent.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';
import { QueueModule } from './queue/queue.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    EventsModule,
    AuditModule,
    AuthModule,
    QueueModule,
    SecurityModule,
    DashboardModule,
    LeadsModule,
    ConversationsModule,
    AgentSettingsModule,
    WhatsappModule,
    GoogleIntegrationModule,
    GoogleDriveModule,
    KnowledgeModule,
    EmbeddingsModule,
    AiProvidersModule,
    RetrievalModule,
    SyncModule,
    SalesAgentModule,
    CalendarModule,
    FollowupsModule,
    OpportunitiesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
