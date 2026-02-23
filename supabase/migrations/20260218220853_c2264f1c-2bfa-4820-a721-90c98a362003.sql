
-- Fix: recreate sales view with SECURITY INVOKER (not SECURITY DEFINER)
-- This ensures RLS of the querying user is respected, not the view owner
DROP VIEW IF EXISTS public.stock_units_sales_view;

CREATE VIEW public.stock_units_sales_view
  WITH (security_invoker = true)
AS
  SELECT
    id,
    product_id,
    condition_status,
    selling_price,
    stock_status,
    received_at,
    status_changed_at,
    notes
  FROM public.stock_units;
