import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TenantId } from '../security/current-user.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@TenantId() companyId: string) {
    return this.dashboard.summary(companyId);
  }

  @Get('usage')
  usage(@TenantId() companyId: string) {
    return this.dashboard.usage(companyId);
  }
}
