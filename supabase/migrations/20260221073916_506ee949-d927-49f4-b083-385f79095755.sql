
-- Table to store multiple RajaOngkir API keys with fallback order
CREATE TABLE public.rajaongkir_api_keys (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL DEFAULT 'API Key',
  api_key text NOT NULL,
  priority integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  last_rate_limited_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rajaongkir_api_keys ENABLE ROW LEVEL SECURITY;

-- Only super_admin and web_admin can manage
CREATE POLICY "superadmin_manage_api_keys"
  ON public.rajaongkir_api_keys
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "webadmin_manage_api_keys"
  ON public.rajaongkir_api_keys
  FOR ALL
  USING (has_role(auth.uid(), 'web_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'web_admin'::app_role));

-- Service role can read (for edge function)
CREATE POLICY "service_read_api_keys"
  ON public.rajaongkir_api_keys
  FOR SELECT
  USING (true);

-- Trigger for updated_at
CREATE TRIGGER set_rajaongkir_api_keys_updated_at
  BEFORE UPDATE ON public.rajaongkir_api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Unique constraint on priority to avoid duplicates
CREATE UNIQUE INDEX idx_rajaongkir_priority ON public.rajaongkir_api_keys(priority) WHERE is_active = true;
