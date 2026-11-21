import type { DatabaseService } from '../database/database.service';
import { currentTenantId } from '../tenancy/tenant-context';

const ready = new Set<string>();

/**
 * Template header images live in `whatsapp_template_media` (migration 0005). Production does not run
 * migrations on start-up, so the table is created on first use. Idempotent and cheap after the first call.
 */
export async function ensureTemplateMediaTable(db: Pick<DatabaseService, 'query'>) {
  const key = currentTenantId() || 'default';
  if (ready.has(key)) return;
  await db.query(`create table if not exists whatsapp_template_media (
    company_id text not null,
    template_name text not null,
    language text not null,
    mime_type text not null,
    data bytea not null,
    created_at timestamptz not null default now(),
    primary key (company_id, template_name, language)
  )`);
  ready.add(key);
}
