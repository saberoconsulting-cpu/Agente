import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PublicRoute } from '../security/public.decorator';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@PublicRoute()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, service: 'sabero-ai-sales-engine' };
    } catch {
      throw new ServiceUnavailableException('El servicio todavía no está disponible.');
    }
  }

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
