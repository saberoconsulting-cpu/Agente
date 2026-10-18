import { Controller, Get, Query } from '@nestjs/common';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  list(
    @Query('company_id') companyId = 'sabero',
    @Query('limit') limit = '50',
  ) {
    return this.events.list(companyId, Number(limit));
  }
}
