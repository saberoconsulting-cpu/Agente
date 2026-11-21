import { Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import { readFileSync } from 'fs';
import { TenantService } from '../tenancy/tenant.service';
import { currentTenantId } from '../tenancy/tenant-context';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly context = new AsyncLocalStorage<PoolClient>();

  constructor(private readonly config: ConfigService, private readonly tenants: TenantService) {
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const caFile = this.config.get<string>('DATABASE_SSL_CA_FILE');
    const ca = this.config.get<string>('DATABASE_SSL_CA') || (caFile ? readFileSync(caFile, 'utf8') : undefined);
    const sslEnabled = this.config.get<string>('DATABASE_SSL') !== 'false';
    this.pool = new Pool({
      connectionString,
      ...(this.config.get<string>('DATABASE_SCHEMA') === 'agent' ? { options: '-c search_path=agent,public' } : {}),
      max: Number(this.config.get<string>('DATABASE_POOL_MAX') || 5),
      ssl: sslEnabled ? { rejectUnauthorized: isProduction, ...(ca ? { ca } : {}) } : false,
    });
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const client = this.context.getStore();
    if (client) return client.query<T>(text, params);
    const tenantId = currentTenantId();
    if (this.tenants.isRouted(tenantId)) {
      const tenantPool = this.tenants.poolFor(tenantId);
      if (!tenantPool) throw new ServiceUnavailableException(`Tenant ${tenantId} is not initialized`);
      return tenantPool.query<T>(text, params);
    }
    return this.pool.query<T>(text, params);
  }

  async conversationLock<T>(companyId: string, conversationId: string, work: () => Promise<T>): Promise<T> {
    let pool = this.pool;
    if (this.tenants.isRouted(companyId)) {
      const tenantPool = this.tenants.poolFor(companyId);
      if (!tenantPool) throw new ServiceUnavailableException(`Tenant ${companyId} is not initialized`);
      pool = tenantPool;
    }
    const client = await pool.connect();
    const key = `${companyId}:${conversationId}`;
    try {
      await client.query('select pg_advisory_lock(hashtextextended($1,0))', [key]);
      return await this.context.run(client, work);
    } finally {
      try { await client.query('select pg_advisory_unlock(hashtextextended($1,0))', [key]); }
      finally { client.release(); }
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
