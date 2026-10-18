import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AgentSettingsService,
  UpdateAgentSettingsInput,
  UpsertPolicyInput,
  UpsertServiceInput,
} from './agent-settings.service';
import { Roles } from '../security/roles.decorator';

@Controller('agent-settings')
export class AgentSettingsController {
  constructor(private readonly settings: AgentSettingsService) {}

  @Get()
  get(@Query('company_id') companyId = 'sabero') {
    return this.settings.get(companyId);
  }

  @Patch()
  @Roles('owner')
  update(@Body() body: UpdateAgentSettingsInput & { company_id?: string }) {
    return this.settings.update(body.company_id || 'sabero', body);
  }

  @Post('services')
  @Roles('owner')
  upsertService(@Body() body: UpsertServiceInput & { company_id?: string }) {
    return this.settings.upsertService(body.company_id || 'sabero', body);
  }

  @Patch('services/:id/active')
  @Roles('owner')
  setServiceActive(
    @Param('id') id: string,
    @Body() body: { company_id?: string; active: boolean },
  ) {
    return this.settings.setServiceActive(body.company_id || 'sabero', id, body.active);
  }

  @Delete('services/:id')
  @Roles('owner')
  deleteService(@Param('id') id: string, @Query('company_id') companyId = 'sabero') {
    return this.settings.deleteService(companyId, id);
  }

  @Post('policies')
  @Roles('owner')
  upsertPolicy(@Body() body: UpsertPolicyInput & { company_id?: string }) {
    return this.settings.upsertPolicy(body.company_id || 'sabero', body);
  }

  @Patch('policies/:id/active')
  @Roles('owner')
  setPolicyActive(
    @Param('id') id: string,
    @Body() body: { company_id?: string; active: boolean },
  ) {
    return this.settings.setPolicyActive(body.company_id || 'sabero', id, body.active);
  }
}
