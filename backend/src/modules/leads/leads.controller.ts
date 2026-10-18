import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { Roles } from '../security/roles.decorator';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(
    @Query('company_id') companyId = 'sabero',
    @Query('limit') limit = '50',
  ) {
    return this.leads.list(companyId, Number(limit));
  }

  @Get(':id')
  get(@Param('id') id: string, @Query('company_id') companyId = 'sabero') {
    return this.leads.get(companyId, id);
  }

  @Patch(':id/status')
  @Roles('owner', 'admin')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { company_id?: string; status: string },
  ) {
    return this.leads.updateStatus(body.company_id || 'sabero', id, body.status);
  }
}
