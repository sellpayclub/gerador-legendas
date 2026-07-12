-- Attribution (UTMs + Meta cookies) on checkout orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_medium text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS utm_term text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fbclid text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fbc text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS fbp text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS meta_purchase_sent_at timestamptz;

ALTER TABLE public.global_settings ADD COLUMN IF NOT EXISTS meta_capi_token text;
