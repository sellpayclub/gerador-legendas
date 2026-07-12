-- ClipSaaS hosted: extend existing profiles + new tables (safe on shared Supabase)

-- Colunas novas em profiles (app legado mantém name, etc.)
alter table public.profiles
  add column if not exists name text,
  add column if not exists access_active boolean not null default false,
  add column if not exists plan_name text,
  add column if not exists cakto_customer_id text;

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

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;

drop policy if exists jobs_select_own on public.jobs;
create policy jobs_select_own on public.jobs
  for select using (auth.uid() = user_id);

revoke all on public.user_secrets from anon, authenticated;
grant all on public.user_secrets to service_role;
grant all on public.profiles to service_role;
grant all on public.jobs to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, access_active, name)
  values (
    new.id,
    coalesce(new.email, ''),
    false,
    coalesce(split_part(new.email, '@', 1), 'user')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin inicial (ajuste o e-mail se necessário)
update public.profiles
set access_active = true, plan_name = 'admin'
where email = 'personaldann@gmail.com';
