import { Module } from '@nestjs/common';
import { GoogleIntegrationModule } from '../integrations/google/google-integration.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [GoogleIntegrationModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
