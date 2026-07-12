-- Rastreio do e-mail PIX enviado no checkout
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_email_sent_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS pix_email_id text;
