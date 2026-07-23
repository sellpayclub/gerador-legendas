-- Asaas identifiers for the PIX checkout. Keep the OpenPix column during rollback.
alter table public.orders add column if not exists asaas_payment_id text;
alter table public.orders add column if not exists asaas_customer_id text;

create unique index if not exists idx_orders_asaas_payment_id
  on public.orders (asaas_payment_id)
  where asaas_payment_id is not null;

