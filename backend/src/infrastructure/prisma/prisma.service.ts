import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantService } from '../../modules/tenancy/tenant.service';
import { currentTenantId } from '../../modules/tenancy/tenant-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly tenants: TenantService) {
    super();
    const self = this;
    // Route every model/$-method access to the tenant client resolved from the
    // AsyncLocalStorage tenant context. The default client serves the default company.
    return new Proxy(self, {
      get(target, prop) {
        const tenantId = currentTenantId();
        if (tenantId && self.tenants.isRouted(tenantId)) {
          const client = self.tenants.prismaFor(tenantId);
          if (!client) throw new Error(`Tenant ${tenantId} database is not initialized`);
          const value = Reflect.get(client, prop);
          return typeof value === 'function' ? value.bind(client) : value;
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as this;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
