-- Webhook audit log + storage bucket for manual PDF (Edge Function cakto-webhook)

create table if not exists public.webhook_events (
  order_id text primary key,
  event text not null,
  email text not null,
  status text not null check (status in ('ok', 'error', 'ignored')),
  email_id text,
  error_message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists webhook_events_created_at_idx on public.webhook_events(created_at desc);
create index if not exists webhook_events_email_idx on public.webhook_events(email);

alter table public.webhook_events enable row level security;

revoke all on public.webhook_events from anon, authenticated;
grant all on public.webhook_events to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assets',
  'assets',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
