-- Add Google Maps URL to branches for rating redirects
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS google_maps_url text;
