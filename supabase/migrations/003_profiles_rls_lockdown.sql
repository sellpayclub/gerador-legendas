-- ClipSaaS: lock billing fields on profiles (prevent self-activation bypass)

alter table public.profiles
  add column if not exists name text;

drop policy if exists profiles_update_own on public.profiles;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

-- Belt-and-suspenders: block billing field changes even if UPDATE policy is re-added
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.access_active is distinct from old.access_active
       or new.plan_name is distinct from old.plan_name
       or new.cakto_customer_id is distinct from old.cakto_customer_id then
      raise exception 'billing fields are read-only';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_billing on public.profiles;
create trigger protect_profile_billing
  before update on public.profiles
  for each row execute function public.protect_profile_billing_fields();
