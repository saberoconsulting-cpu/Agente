import { Body, Controller, Post } from '@nestjs/common';
import { FollowupsService, ScheduleFollowupInput } from './followups.service';

@Controller('followups')
export class FollowupsController {
  constructor(private readonly followups: FollowupsService) {}

  @Post()
  schedule(@Body() body: ScheduleFollowupInput) {
    return this.followups.schedule({
      ...body,
      company_id: body.company_id || 'sabero',
    });
  }

  @Post('process-due')
  processDue(@Body() body: { company_id?: string; limit?: number }) {
    return this.followups.processDue(body.company_id || 'sabero', body.limit || 10);
  }
}
