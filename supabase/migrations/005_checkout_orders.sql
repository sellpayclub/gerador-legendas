-- Tabela de pedidos do checkout PIX (OpenPix/Woovi)
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  correlation_id text UNIQUE NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_whatsapp text,
  customer_cpf text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  openpix_charge_id text,
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_orders_correlation_id ON public.orders (correlation_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON public.orders (customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);

-- RLS — only service_role can access orders (backend/edge functions)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON public.orders
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
