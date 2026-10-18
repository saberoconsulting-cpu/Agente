import { Body, Controller, Post } from '@nestjs/common';
import { FollowupsService, ScheduleFollowupInput } from './followups.service';
import { Roles } from '../security/roles.decorator';
import { TenantId } from '../security/current-user.decorator';
import { QueueService } from '../queue/queue.service';

@Controller('followups')
export class FollowupsController {
  constructor(private readonly followups: FollowupsService, private readonly queue: QueueService) {}

  @Post()
  @Roles('owner', 'admin')
  schedule(@Body() body: ScheduleFollowupInput) {
    return this.followups.schedule({
      ...body,
      company_id: body.company_id || 'sabero',
    });
  }

  @Post('process-due')
  @Roles('owner')
  async processDue(@TenantId() companyId: string) {
    await this.queue.enqueue('followup.process', companyId, {}, new Date(), 'followup-manual');
    return { accepted: true };
  }
}
