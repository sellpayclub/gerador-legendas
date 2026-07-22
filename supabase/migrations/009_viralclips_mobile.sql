-- Anonymous mobile identities can process a draft, but export is granted only
-- by the RevenueCat server integration. Neither field is writable by clients.
alter table public.profiles
  add column if not exists mobile_access boolean not null default false,
  add column if not exists mobile_premium boolean not null default false,
  add column if not exists mobile_entitlement_updated_at timestamptz;

create index if not exists profiles_mobile_premium_idx
  on public.profiles (mobile_premium)
  where mobile_premium = true;

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
       or new.cakto_customer_id is distinct from old.cakto_customer_id
       or new.mobile_access is distinct from old.mobile_access
       or new.mobile_premium is distinct from old.mobile_premium
       or new.mobile_entitlement_updated_at is distinct from old.mobile_entitlement_updated_at then
      raise exception 'billing fields are read-only';
    end if;
  end if;
  return new;
end;
$$;
