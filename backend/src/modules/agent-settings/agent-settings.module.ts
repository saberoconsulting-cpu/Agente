import { Module } from '@nestjs/common';
import { AgentSettingsController } from './agent-settings.controller';
import { AgentSettingsService } from './agent-settings.service';

@Module({
  controllers: [AgentSettingsController],
  providers: [AgentSettingsService],
})
export class AgentSettingsModule {}
