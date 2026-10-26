import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly context = new AsyncLocalStorage<PoolClient>();

  constructor(private readonly config: ConfigService) {
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const ca = this.config.get<string>('DATABASE_SSL_CA');
    const sslEnabled = this.config.get<string>('DATABASE_SSL') !== 'false';
    this.pool = new Pool({
      connectionString,
      ...(this.config.get<string>('DATABASE_SCHEMA') === 'agent' ? { options: '-c search_path=agent,public' } : {}),
      max: Number(this.config.get<string>('DATABASE_POOL_MAX') || 5),
      ssl: sslEnabled ? { rejectUnauthorized: isProduction, ...(ca ? { ca } : {}) } : false,
    });
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return (this.context.getStore() || this.pool).query<T>(text, params);
  }

  async conversationLock<T>(companyId: string, conversationId: string, work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
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
