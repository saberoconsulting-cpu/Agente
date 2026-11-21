import { Body, Controller, Delete, ForbiddenException, Get, Param, Put } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../security/roles.decorator';
import { CurrentUser } from '../security/current-user.decorator';
import { AuthTokenPayload } from '../auth/token';
import { VisionService } from './vision.service';
import { TenantService } from '../tenancy/tenant.service';
import { tenantContext } from '../tenancy/tenant-context';

@Controller('vision')
export class VisionController {
  constructor(private readonly vision: VisionService, private readonly config: ConfigService, private readonly tenants: TenantService) {}

  /** Company owner: usage, limit and whether the company reads images with its own key. */
  @Get('settings')
  @Roles('owner')
  settings(@CurrentUser() user: AuthTokenPayload) {
    return this.vision.status(user.company_id);
  }

  @Put('settings/key')
  @Roles('owner')
  setKey(@CurrentUser() user: AuthTokenPayload, @Body() body: { provider?: string; api_key?: string }) {
    return this.vision.setOwnKey(user.company_id, body.provider, body.api_key);
  }

  @Delete('settings/key')
  @Roles('owner')
  removeKey(@CurrentUser() user: AuthTokenPayload) {
    return this.vision.removeOwnKey(user.company_id);
  }

  /** Platform administrator: read any company's consumption. */
  @Get('admin/:companyId')
  @Roles('owner')
  async adminStatus(@CurrentUser() user: AuthTokenPayload, @Param('companyId') companyId: string) {
    this.assertAdministrator(user);
    return this.inCompany(companyId, () => this.vision.status(companyId));
  }

  /** Platform administrator: set the monthly image allowance (platform key) for a company's plan. */
  @Put('admin/:companyId/limit')
  @Roles('owner')
  async adminLimit(@CurrentUser() user: AuthTokenPayload, @Param('companyId') companyId: string, @Body() body: { monthly_limit?: number }) {
    this.assertAdministrator(user);
    return this.inCompany(companyId, () => this.vision.setLimit(companyId, body.monthly_limit));
  }

  /** Platform administrator: assign the monthly plan (Básico, Estándar, Pro, Ilimitado) to a company. */
  @Put('admin/:companyId/plan')
  @Roles('owner')
  async adminPlan(@CurrentUser() user: AuthTokenPayload, @Param('companyId') companyId: string, @Body() body: { plan?: string }) {
    this.assertAdministrator(user);
    return this.inCompany(companyId, () => this.vision.setPlan(companyId, body.plan));
  }

  /** Each company has its own database, so the allowance must be written where that company's agent reads it. */
  private async inCompany<T>(companyId: string, action: () => Promise<T>) {
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(companyId)) throw new ForbiddenException('Empresa no válida.');
    await this.tenants.ensure(companyId);
    return tenantContext.run({ companyId }, action);
  }

  private assertAdministrator(user: AuthTokenPayload) {
    const emails = (this.config.get<string>('PLATFORM_ADMIN_EMAILS') || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    const allowed = user.role === 'owner' && user.company_id === this.config.get<string>('PLATFORM_ADMIN_COMPANY_ID') && emails.includes(user.email.toLowerCase());
    if (!allowed) throw new ForbiddenException('Platform administrator required');
  }
}
