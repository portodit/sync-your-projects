
-- Fix: remove overly permissive public read policy on API keys
DROP POLICY IF EXISTS "service_read_api_keys" ON public.rajaongkir_api_keys;

-- Edge functions use service_role_key which bypasses RLS, so no public read needed
