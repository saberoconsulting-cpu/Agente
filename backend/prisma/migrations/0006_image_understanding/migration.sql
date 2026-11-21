create table if not exists vision_settings (
  company_id text primary key,
  monthly_limit integer not null default 0,
  plan text not null default 'none',
  provider text,
  api_key_encrypted text,
  updated_at timestamptz not null default now()
);
create table if not exists vision_usage (
  company_id text not null,
  month text not null,
  platform_count integer not null default 0,
  own_count integer not null default 0,
  primary key (company_id, month)
);
