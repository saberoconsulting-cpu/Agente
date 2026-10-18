import 'dotenv/config';
import { Pool } from 'pg';

const sql = `
create extension if not exists "pgcrypto";
create extension if not exists vector;

create table if not exists companies (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into companies (id, name)
values ('sabero', 'SABERO Consulting')
on conflict (id) do nothing;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  whatsapp_number text not null,
  name text,
  status text not null default 'new',
  qualification jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, whatsapp_number)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  lead_id uuid references leads(id),
  channel text not null,
  external_id text not null,
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, channel, external_id)
);

create table if not exists inbound_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  conversation_id uuid not null references conversations(id),
  provider_message_id text unique,
  direction text not null,
  message_type text not null,
  text_body text,
  raw_payload jsonb,
  inbound_event_id uuid references inbound_webhook_events(id),
  created_at timestamptz not null default now()
);

create table if not exists outbound_messages (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  recipient text not null,
  text_body text not null,
  provider_message_id text,
  raw_response jsonb,
  created_at timestamptz not null default now()
);

create table if not exists google_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  provider_account_email text,
  scopes text[] not null default '{}',
  encrypted_tokens text not null,
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create table if not exists whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  meta_app_id text,
  waba_id text not null,
  phone_number_id text not null,
  display_phone_number text,
  verified_name text,
  encrypted_access_token text not null,
  scopes text[] not null default '{}',
  token_type text,
  token_expires_at timestamptz,
  status text not null default 'pending',
  connected_at timestamptz,
  revoked_at timestamptz,
  disconnect_reason text,
  last_webhook_at timestamptz,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_connections_status_check
    check (status in ('pending', 'connected', 'failed', 'revoked', 'disabled'))
);

create unique index if not exists whatsapp_connections_company_phone_unique
  on whatsapp_connections (company_id, phone_number_id);

create unique index if not exists whatsapp_connections_active_phone_unique
  on whatsapp_connections (phone_number_id)
  where revoked_at is null and status in ('pending', 'connected', 'disabled');

create index if not exists whatsapp_connections_company_status_idx
  on whatsapp_connections (company_id, status);

create index if not exists whatsapp_connections_waba_idx
  on whatsapp_connections (waba_id);

create table if not exists google_drive_files (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  google_file_id text not null,
  name text not null,
  mime_type text not null,
  web_view_link text,
  version text,
  modified_time timestamptz,
  trashed boolean not null default false,
  sync_status text not null default 'pending',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, google_file_id)
);

create table if not exists knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  source_type text not null,
  source_id text not null,
  title text not null,
  mime_type text,
  source_version text,
  source_modified_at timestamptz,
  status text not null default 'indexed',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source_type, source_id)
);

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create table if not exists knowledge_embeddings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  chunk_id uuid not null references knowledge_chunks(id) on delete cascade,
  provider text not null,
  model text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (chunk_id, provider, model)
);

create index if not exists knowledge_embeddings_company_idx
  on knowledge_embeddings (company_id);

create table if not exists knowledge_references (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  conversation_id uuid references conversations(id),
  message_id uuid references messages(id),
  document_id uuid references knowledge_documents(id),
  chunk_id uuid references knowledge_chunks(id),
  created_at timestamptz not null default now()
);

create table if not exists sync_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  source_type text not null,
  source_id text,
  status text not null default 'pending',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists company_agent_settings (
  company_id text primary key references companies(id),
  agent_name text not null default 'Asistente virtual',
  tone text not null default 'consultivo, claro y orientado a conversion',
  language text not null default 'es',
  llm_provider text not null default 'deepseek',
  llm_model text not null default 'deepseek-chat',
  system_rules text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into company_agent_settings (
  company_id, agent_name, tone, language, llm_provider, llm_model, system_rules
)
values (
  'sabero',
  'Asistente virtual de SABERO Consulting',
  'consultivo, natural, claro y orientado a agendar reuniones',
  'es',
  'deepseek',
  'deepseek-chat',
  'No inventar precios, garantias, descuentos, plazos ni capacidades no verificadas. Identificarse como asistente virtual de SABERO. Descubrir necesidad, alcance, urgencia, presupuesto y decisor de forma progresiva.'
)
on conflict (company_id) do nothing;

create table if not exists company_services (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  name text not null,
  description text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists negotiation_policies (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  policy_key text not null,
  policy_text text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, policy_key)
);

insert into negotiation_policies (company_id, policy_key, policy_text)
values
  ('sabero', 'pricing', 'No dar precios definitivos ni descuentos si no existe rango aprobado. Explicar que depende del alcance y hacer una pregunta util.'),
  ('sabero', 'scope', 'No prometer capacidades, integraciones, garantias ni plazos sin validacion. Proponer discovery tecnico o reunion.'),
  ('sabero', 'meeting', 'Cuando exista contexto suficiente, proponer una reunion para levantar alcance y siguientes pasos.')
on conflict (company_id, policy_key) do nothing;

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  lead_id uuid references leads(id),
  conversation_id uuid references conversations(id),
  calendar_provider text not null default 'google',
  calendar_id text not null,
  provider_event_id text,
  title text not null,
  description text,
  attendee_name text,
  attendee_email text,
  attendee_phone text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  timezone text not null default 'America/Lima',
  status text not null default 'booked',
  idempotency_key text,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create index if not exists meetings_company_start_idx
  on meetings (company_id, start_time);

create table if not exists opportunity_briefs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  lead_id uuid references leads(id),
  conversation_id uuid references conversations(id),
  need text,
  scope text,
  urgency text,
  budget text,
  authority text,
  objections text,
  next_step text,
  summary text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  lead_id uuid references leads(id),
  conversation_id uuid references conversations(id),
  channel text not null default 'whatsapp',
  recipient text not null,
  message text not null,
  template_name text,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled',
  reason text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create index if not exists followups_due_idx
  on followups (status, scheduled_at);

create table if not exists opt_outs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  channel text not null default 'whatsapp',
  recipient text not null,
  opted_out_at timestamptz not null default now(),
  reason text,
  unique (company_id, channel, recipient)
);

create table if not exists agent_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  event_type text not null,
  aggregate_type text,
  aggregate_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_events_company_created_idx
  on agent_events (company_id, created_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  actor_type text not null default 'system',
  actor_id text,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_company_created_idx
  on audit_logs (company_id, created_at desc);

create table if not exists outbound_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  event_id uuid references agent_events(id) on delete cascade,
  target_url text not null,
  status text not null default 'pending',
  status_code integer,
  request_payload jsonb not null,
  response_body jsonb,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outbound_webhook_deliveries_event_idx
  on outbound_webhook_deliveries (event_id);

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id),
  email text not null unique,
  password_hash text not null,
  role text not null default 'owner',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_users_company_idx
  on admin_users (company_id);

-- Added incrementally to preserve existing installations that used the legacy bootstrap script.
create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references admin_users(id) on delete cascade,
  refresh_token_hash text not null unique,
  csrf_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_sessions_active_user_idx
  on auth_sessions (user_id, expires_at) where revoked_at is null;

create table if not exists google_oauth_states (
  id uuid primary key default gen_random_uuid(),
  state_hash text not null unique,
  company_id text not null references companies(id),
  user_id uuid not null references admin_users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists google_oauth_states_active_idx
  on google_oauth_states (expires_at) where used_at is null;

create table if not exists job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  company_id text not null references companies(id),
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status text not null default 'pending',
  attempts integer not null default 0,
  error_message text,
  locked_at timestamptz,
  lock_expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_type, company_id, run_at),
  unique (job_type, company_id, dedupe_key)
);

alter table job_queue add column if not exists dedupe_key text;
create unique index if not exists job_queue_active_dedupe_idx
  on job_queue (job_type, company_id, dedupe_key) where dedupe_key is not null;

create index if not exists job_queue_pending_idx
  on job_queue (status, run_at) where status = 'pending';

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(), company_id text not null references companies(id),
  lead_id uuid not null references leads(id), conversation_id uuid references conversations(id),
  assignee_id uuid references admin_users(id), stage text not null default 'nuevo', score integer not null default 0,
  score_signals jsonb not null default '{}'::jsonb, service_interest text, estimated_value numeric,
  next_action text, loss_reason text, last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (stage in ('nuevo','calificado','reunion_propuesta','reunion_agendada','propuesta','ganado','perdido'))
);
create unique index if not exists opportunities_one_open_lead_idx on opportunities(company_id, lead_id) where stage not in ('ganado','perdido');
create index if not exists opportunities_company_stage_idx on opportunities(company_id, stage, score desc);
create table if not exists opportunity_activities (
  id uuid primary key default gen_random_uuid(), company_id text not null references companies(id),
  opportunity_id uuid not null references opportunities(id) on delete cascade, actor_id uuid references admin_users(id),
  activity_type text not null, content text not null, created_at timestamptz not null default now()
);
create index if not exists opportunity_activities_opportunity_idx on opportunity_activities(opportunity_id, created_at desc);
`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false'
      ? false
      : { rejectUnauthorized: process.env.NODE_ENV === 'production', ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA } : {}) },
  });

  try {
    await pool.query(sql);
    console.log('Database migration completed');
  } finally {
    await pool.end();
  }
}

void main();
