import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from '../security/public.decorator';

@PublicRoute()
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: 'sabero-ai-sales-engine',
      company_id: process.env.COMPANY_ID || 'sabero',
      timestamp: new Date().toISOString(),
    };
  }
}
