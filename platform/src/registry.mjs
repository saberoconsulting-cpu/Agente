import pg from 'pg';
import { decrypt, tenantId, tokenHash } from './domain.mjs';
import { accessRequestSchema } from './access-requests.mjs';

const baseControlSchema = `
CREATE TABLE IF NOT EXISTS platform_companies (
 id text PRIMARY KEY, name text NOT NULL, sector text NOT NULL,
 database_name text NOT NULL UNIQUE, encrypted_connection text NOT NULL,
 mongo_database text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'provisioning' CHECK(status IN ('provisioning','active','suspended','failed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_companies ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS platform_products (
 company_id text NOT NULL REFERENCES platform_companies(id),
 product text NOT NULL CHECK(product IN ('agent','crm')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','disabled')),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,product)
);
CREATE TABLE IF NOT EXISTS platform_service_credentials (
 company_id text NOT NULL REFERENCES platform_companies(id), product text NOT NULL,
 token_hash text NOT NULL UNIQUE, PRIMARY KEY(company_id,product),
 FOREIGN KEY(company_id,product) REFERENCES platform_products(company_id,product)
);`;

export const controlSchema = baseControlSchema + accessRequestSchema;

export const contactSchema = `
CREATE SCHEMA IF NOT EXISTS platform;
CREATE TABLE IF NOT EXISTS platform.agent_access_activations (
 request_id uuid PRIMARY KEY, user_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS platform.contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone text UNIQUE,
 email text, name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform.contact_links (
 product text NOT NULL CHECK(product IN ('agent','crm')), external_id text NOT NULL,
 contact_id uuid NOT NULL REFERENCES platform.contacts(id), PRIMARY KEY(product,external_id)
);
CREATE TABLE IF NOT EXISTS platform.contact_outbox (
 product text NOT NULL, external_id text NOT NULL, version uuid NOT NULL DEFAULT gen_random_uuid(),
 PRIMARY KEY(product,external_id)
);
CREATE TABLE IF NOT EXISTS platform.contact_inbox (
 product text NOT NULL, contact_id uuid NOT NULL REFERENCES platform.contacts(id),
 version uuid NOT NULL DEFAULT gen_random_uuid(), PRIMARY KEY(product,contact_id)
);`;

export class Registry {
  constructor(env = process.env) {
    if (!env.CONTROL_DATABASE_URL || !env.PLATFORM_ENCRYPTION_KEY) throw new Error('Control database and encryption key are required');
    this.env = env;
    this.control = new pg.Pool({ connectionString: env.CONTROL_DATABASE_URL, max: 4 });
    this.pools = new Map();
  }
  async authenticate(id, token) {
    tenantId(id);
    if (!token || token.length < 32) return null;
    const { rows } = await this.control.query(`SELECT c.*, k.product FROM platform_companies c
      JOIN platform_service_credentials k ON k.company_id=c.id
      JOIN platform_products p ON p.company_id=k.company_id AND p.product=k.product
      WHERE c.id=$1 AND k.token_hash=$2 AND c.status='active' AND p.status='active'`, [id, tokenHash(token)]);
    return rows[0] || null;
  }
  async database(company) {
    let entry = this.pools.get(company.id);
    if (!entry) {
      // Bound the number of idle company pools in the shared service.
      if (this.pools.size >= 100) {
        const [id, oldest] = this.pools.entries().next().value;
        this.pools.delete(id);
        await oldest.end();
      }
      entry = new pg.Pool({ connectionString: decrypt(company.encrypted_connection, this.env.PLATFORM_ENCRYPTION_KEY),
        max: Number(this.env.TENANT_POOL_MAX || 2), idleTimeoutMillis: 30000 });
      this.pools.set(company.id, entry);
    }
    return entry;
  }
  async close() {
    await Promise.all([...this.pools.values()].map(pool => pool.end()));
    await this.control.end();
  }
}
