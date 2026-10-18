import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser, TenantId } from '../security/current-user.decorator';
import { Roles } from '../security/roles.decorator';
import { AuthTokenPayload } from '../auth/token';
import { OpportunitiesService } from './opportunities.service';

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}
  @Get() list(@TenantId() companyId: string, @Query('stage') stage?: string, @Query('assignee_id') assigneeId?: string, @Query('min_score') minScore?: string) { return this.opportunities.list(companyId, { stage, assignee_id: assigneeId, min_score: minScore ? Number(minScore) : undefined }); }
  @Get(':id') detail(@TenantId() companyId: string, @Param('id') id: string) { return this.opportunities.detail(companyId, id); }
  @Post() @Roles('owner','admin') create(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Body() body: { lead_id: string; conversation_id?: string; service_interest?: string }) { return this.opportunities.create(companyId, user.sub, body); }
  @Patch(':id/confirm') @Roles('owner','admin') confirm(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Param('id') id: string) { return this.opportunities.confirm(companyId, id, user.sub); }
  @Patch(':id/stage') @Roles('owner','admin') stage(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Param('id') id: string, @Body() body: { stage: string; loss_reason?: string }) { return this.opportunities.changeStage(companyId, id, body.stage, user.sub, body.loss_reason); }
  @Patch(':id/assign') @Roles('owner','admin') assign(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Param('id') id: string, @Body() body: { assignee_id: string }) { return this.opportunities.assign(companyId, id, body.assignee_id, user.sub); }
  @Post(':id/notes') @Roles('owner','admin') note(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Param('id') id: string, @Body() body: { content: string; next_action?: string }) { return this.opportunities.note(companyId, id, user.sub, body.content, body.next_action); }
  @Post(':id/handoff') @Roles('owner','admin') handoff(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Param('id') id: string, @Body() body: { assignee_id: string }) { return this.opportunities.handoff(companyId, id, body.assignee_id, user.sub); }
  @Post(':id/proposals') @Roles('owner','admin') proposal(@TenantId() companyId: string, @CurrentUser() user: AuthTokenPayload, @Param('id') id: string) { return this.opportunities.createProposal(companyId, id, user.sub); }
}
