import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Query('company_id') companyId = 'sabero',
    @Query('limit') limit = '50',
  ) {
    return this.audit.list(companyId, Number(limit));
  }
}
