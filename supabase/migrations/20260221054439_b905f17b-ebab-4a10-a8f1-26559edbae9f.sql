
-- Add per-unit photo URL column to stock_units
ALTER TABLE public.stock_units ADD COLUMN unit_photo_url text DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.stock_units.unit_photo_url IS 'Per-unit product photo URL, max 1 photo per unit';
