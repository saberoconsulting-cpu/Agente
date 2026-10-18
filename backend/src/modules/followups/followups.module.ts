import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FollowupsController } from './followups.controller';
import { FollowupsService } from './followups.service';

@Module({
  imports: [WhatsappModule],
  controllers: [FollowupsController],
  providers: [FollowupsService],
  exports: [FollowupsService],
})
export class FollowupsModule {}
