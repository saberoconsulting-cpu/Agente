import { Module } from '@nestjs/common';
import { GoogleDriveService } from './google-drive.service';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleIntegrationModule } from '../integrations/google/google-integration.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [GoogleIntegrationModule, KnowledgeModule],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
