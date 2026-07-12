-- Hosted SaaS: profiles, encrypted secrets (backend-only), job ownership

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  access_active boolean not null default false,
  plan_name text,
  cakto_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_secrets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  openai_api_key_encrypted text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  filename text,
  mode text not null default 'legendas',
  created_at timestamptz not null default now()
);

create index if not exists jobs_user_id_idx on public.jobs(user_id);
create index if not exists jobs_created_at_idx on public.jobs(created_at);

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;

-- Profiles: users read/update own row
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- Jobs metadata: users read own rows only
create policy jobs_select_own on public.jobs
  for select using (auth.uid() = user_id);

-- user_secrets: no policies for authenticated/anon (backend service role only)
revoke all on public.user_secrets from anon, authenticated;

-- Auto-create profile on signup (access_active=false until Cakto webhook)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, access_active)
  values (new.id, coalesce(new.email, ''), false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
