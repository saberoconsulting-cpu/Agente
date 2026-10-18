import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AgentSettingsService,
  UpdateAgentSettingsInput,
  UpsertPolicyInput,
  UpsertServiceInput,
} from './agent-settings.service';

@Controller('agent-settings')
export class AgentSettingsController {
  constructor(private readonly settings: AgentSettingsService) {}

  @Get()
  get(@Query('company_id') companyId = 'sabero') {
    return this.settings.get(companyId);
  }

  @Patch()
  update(@Body() body: UpdateAgentSettingsInput & { company_id?: string }) {
    return this.settings.update(body.company_id || 'sabero', body);
  }

  @Post('services')
  upsertService(@Body() body: UpsertServiceInput & { company_id?: string }) {
    return this.settings.upsertService(body.company_id || 'sabero', body);
  }

  @Patch('services/:id/active')
  setServiceActive(
    @Param('id') id: string,
    @Body() body: { company_id?: string; active: boolean },
  ) {
    return this.settings.setServiceActive(body.company_id || 'sabero', id, body.active);
  }

  @Delete('services/:id')
  deleteService(@Param('id') id: string, @Query('company_id') companyId = 'sabero') {
    return this.settings.deleteService(companyId, id);
  }

  @Post('policies')
  upsertPolicy(@Body() body: UpsertPolicyInput & { company_id?: string }) {
    return this.settings.upsertPolicy(body.company_id || 'sabero', body);
  }

  @Patch('policies/:id/active')
  setPolicyActive(
    @Param('id') id: string,
    @Body() body: { company_id?: string; active: boolean },
  ) {
    return this.settings.setPolicyActive(body.company_id || 'sabero', id, body.active);
  }
}
