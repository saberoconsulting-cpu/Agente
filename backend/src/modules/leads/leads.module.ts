import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsRepository } from './repositories/leads.repository';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, LeadsRepository],
})
export class LeadsModule {}
