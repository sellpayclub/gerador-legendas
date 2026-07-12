-- Add is_admin flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Create global_settings table
CREATE TABLE IF NOT EXISTS public.global_settings (
  id text PRIMARY KEY,
  fb_pixel_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert the single default row
INSERT INTO public.global_settings (id, fb_pixel_id)
VALUES ('default', '')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read global settings (public checkout needs pixel ID)
CREATE POLICY "Public read access to global_settings"
  ON public.global_settings
  FOR SELECT
  USING (true);

-- Only admins can update global settings
CREATE POLICY "Admins can update global_settings"
  ON public.global_settings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Only admins can insert global settings
CREATE POLICY "Admins can insert global_settings"
  ON public.global_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );
