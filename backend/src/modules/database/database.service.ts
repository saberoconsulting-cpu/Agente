import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

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
      ssl: sslEnabled ? { rejectUnauthorized: isProduction, ...(ca ? { ca } : {}) } : false,
    });
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
