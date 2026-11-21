create table whatsapp_template_media (
  company_id text not null,
  template_name text not null,
  language text not null,
  mime_type text not null,
  data bytea not null,
  created_at timestamptz not null default now(),
  primary key (company_id, template_name, language)
);
