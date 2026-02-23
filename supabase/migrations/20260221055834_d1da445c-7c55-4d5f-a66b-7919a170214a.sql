-- Change unit_photo_url from single text to array of up to 3 photos
ALTER TABLE public.stock_units ADD COLUMN IF NOT EXISTS unit_photo_urls text[] DEFAULT '{}';

-- Migrate existing single photo data
UPDATE public.stock_units 
SET unit_photo_urls = ARRAY[unit_photo_url]
WHERE unit_photo_url IS NOT NULL AND unit_photo_url != '';

-- We keep unit_photo_url for backward compat but unit_photo_urls is the primary
