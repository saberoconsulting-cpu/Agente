alter table opportunities drop constraint if exists opportunities_stage_check;
alter table opportunities add constraint opportunities_stage_check
  check(stage in ('nuevo','calificado','interesado','seguimiento','reunion_propuesta','reunion_agendada','propuesta_enviada','propuesta','reservado','pagado','en_envio','ganado','perdido'));
create table contact_outbound_requests (
  id uuid primary key, company_id text not null references companies(id),
  lead_id uuid not null references leads(id), actor_id uuid not null references admin_users(id),
  status text not null default 'pending' check(status in ('pending','sent','uncertain')),
  provider_message_id text, payload_hash text not null, created_at timestamptz not null default now(),
  unique(company_id,id)
);
create table contact_media (
  id uuid primary key default gen_random_uuid(), company_id text not null references companies(id),
  lead_id uuid not null references leads(id), provider_media_id text not null,
  filename text not null, mime_type text not null, created_at timestamptz not null default now()
);
create index contact_media_owner_idx on contact_media(company_id,lead_id);
