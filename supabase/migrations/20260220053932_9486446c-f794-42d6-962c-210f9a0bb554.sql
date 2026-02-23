-- Enable pg_net extension for HTTP calls from database
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Replace the placeholder custom_email_hook with actual HTTP call to edge function
CREATE OR REPLACE FUNCTION public.custom_email_hook(event jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  edge_function_url text;
  service_role_key text;
BEGIN
  -- Call the custom-email edge function
  edge_function_url := 'https://vfrreokfypxwfrlbojhy.supabase.co/functions/v1/custom-email';
  
  PERFORM extensions.http_post(
    url := edge_function_url,
    body := event::text,
    content_type := 'application/json'
  );
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the auth operation
  RAISE WARNING 'custom_email_hook failed: %', SQLERRM;
END;
$$;