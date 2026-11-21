import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const CONNECTION_TTL_MS = 60_000;
const MAX_TENANTS = 24;

interface TenantConnection {
  databaseUrl: string;
  prismaUrl: string;
  expires: number;
}

/**
 * Resolves per-company databases registered in the platform control registry
 * and keeps bounded pg pools / Prisma clients for routed (non-default) tenants.
 * The default company keeps using DATABASE_URL / DIRECT_DATABASE_URL.
 */
@Injectable()
export class TenantService implements OnModuleDestroy {
  private readonly logger = new Logger(TenantService.name);
  private readonly connections = new Map<string, TenantConnection>();
  private readonly pools = new Map<string, Pool>();
  private readonly clients = new Map<string, PrismaClient>();
  private readonly defaultCompany: string;

  constructor(private readonly config: ConfigService) {
    this.defaultCompany = this.config.get<string>('COMPANY_ID') || 'sabero';
  }

  get defaultCompanyId(): string {
    return this.defaultCompany;
  }

  private get routingEnabled(): boolean {
    return this.config.get<string>('TENANT_ROUTING') !== 'false'
      && !!this.config.get<string>('PLATFORM_API_URL')
      && !!this.config.get<string>('PLATFORM_ADMIN_TOKEN');
  }

  isRouted(companyId?: string | null): companyId is string {
    return !!companyId && companyId !== this.defaultCompany && this.routingEnabled;
  }

  /** Warms the connection cache and creates the tenant pool/client. Must be awaited before sync getters are used. */
  async ensure(companyId?: string | null): Promise<void> {
    if (!this.isRouted(companyId)) return;
    const connection = await this.connectionFor(companyId);
    if (!this.pools.has(companyId)) {
      this.pools.set(companyId, new Pool({
        connectionString: connection.databaseUrl,
        options: '-c search_path=agent,public',
        max: Number(this.config.get<string>('TENANT_POOL_MAX') || 3),
        idleTimeoutMillis: 30000,
      }));
    }
    if (!this.clients.has(companyId)) {
      this.evictIfNeeded();
      this.clients.set(companyId, new PrismaClient({ datasources: { db: { url: connection.prismaUrl } } }));
    }
  }

  /** Default tenant plus every routed tenant initialized in this process. */
  candidateCompanyIds(): string[] {
    return [this.defaultCompany, ...this.clients.keys()];
  }

  poolFor(companyId?: string | null): Pool | undefined {
    return this.isRouted(companyId) ? this.pools.get(companyId) : undefined;
  }

  prismaFor(companyId?: string | null): PrismaClient | undefined {
    return this.isRouted(companyId) ? this.clients.get(companyId) : undefined;
  }

  private companyIdsCache = { at: 0, ids: [] as string[] };

  /** Active agent companies from the platform registry (cached for 60s). */
  async activeCompanyIds(): Promise<string[]> {
    if (Date.now() - this.companyIdsCache.at < 60_000) return this.companyIdsCache.ids;
    try {
      const { data } = await axios.get(`${this.platformBase()}/v1/admin/companies`, {
        headers: this.adminHeaders(), timeout: 10000,
      });
      const ids = (data?.items || [])
        .filter((item: { status?: string; products?: string[] }) => item.status === 'active' && (item.products || []).includes('agent'))
        .map((item: { id: string }) => item.id);
      this.companyIdsCache = { at: Date.now(), ids };
      return ids;
    } catch {
      return this.companyIdsCache.ids;
    }
  }

  /** Maps a login email to its company through the platform registry. Returns null for the default tenant. */
  async companyForEmail(email: string): Promise<string | null> {
    if (!this.routingEnabled) return null;
    try {
      const { data } = await axios.post(
        `${this.platformBase()}/v1/admin/tenants/resolve-email`,
        { email: email.trim().toLowerCase() },
        { headers: this.adminHeaders(), timeout: 8000 },
      );
      const companyId = data?.company_id;
      return companyId && companyId !== this.defaultCompany ? companyId : null;
    } catch (error) {
      this.logger.warn(`Tenant email resolution failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private async connectionFor(companyId: string): Promise<TenantConnection> {
    const hit = this.connections.get(companyId);
    if (hit && hit.expires > Date.now()) return hit;
    try {
      const { data } = await axios.get(
        `${this.platformBase()}/v1/admin/tenants/${companyId}/connection`,
        { headers: this.adminHeaders(), timeout: 10000 },
      );
      if (!data?.database_url) throw new Error('missing database_url');
      const prismaUrl = new URL(data.database_url);
      prismaUrl.searchParams.set('schema', 'agent');
      prismaUrl.searchParams.set('connection_limit', '5');
      const entry: TenantConnection = {
        databaseUrl: data.database_url,
        prismaUrl: prismaUrl.toString(),
        expires: Date.now() + CONNECTION_TTL_MS,
      };
      this.connections.set(companyId, entry);
      return entry;
    } catch (error) {
      if (hit) {
        this.logger.warn(`Using stale connection for tenant ${companyId}`);
        return hit;
      }
      this.logger.error(`Tenant ${companyId} connection failed: ${error instanceof Error ? error.message : error}`);
      throw new ServiceUnavailableException(`Tenant ${companyId} is unavailable`);
    }
  }

  private platformBase(): string {
    return this.config.get<string>('PLATFORM_API_URL')!.replace(/\/+$/, '');
  }

  private adminHeaders() {
    return { authorization: `Bearer ${this.config.get<string>('PLATFORM_ADMIN_TOKEN')}` };
  }

  private evictIfNeeded(): void {
    while (this.clients.size >= MAX_TENANTS) {
      const oldest = this.clients.keys().next().value as string;
      const client = this.clients.get(oldest);
      this.clients.delete(oldest);
      const pool = this.pools.get(oldest);
      this.pools.delete(oldest);
      this.connections.delete(oldest);
      void client?.$disconnect();
      void pool?.end();
      this.logger.warn(`Evicted tenant ${oldest} (max ${MAX_TENANTS})`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.clients.values()].map(client => client.$disconnect()));
    await Promise.all([...this.pools.values()].map(pool => pool.end()));
    this.clients.clear();
    this.pools.clear();
    this.connections.clear();
  }
}
