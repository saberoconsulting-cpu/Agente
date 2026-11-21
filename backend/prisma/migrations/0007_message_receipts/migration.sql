create table if not exists whatsapp_message_receipts (
  company_id text not null,
  provider_message_id text not null,
  status text not null check (status in ('sent','delivered','read','failed')),
  occurred_at timestamptz not null,
  primary key (company_id, provider_message_id, status)
);
