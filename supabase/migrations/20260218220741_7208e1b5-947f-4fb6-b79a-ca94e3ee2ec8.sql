
-- ══════════════════════════════════════════════════════════════════
-- Production-grade fixes for stock_units & stock_unit_logs
-- ══════════════════════════════════════════════════════════════════

-- 1. Drop inline UNIQUE on imei (keep via separate index for flexibility)
ALTER TABLE public.stock_units DROP CONSTRAINT IF EXISTS stock_units_imei_key;

-- Recreate as a named standalone index (can be dropped/altered independently)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_units_imei
  ON public.stock_units (imei);

-- 2. Add price & condition consistency constraints
ALTER TABLE public.stock_units
  DROP CONSTRAINT IF EXISTS chk_selling_price_non_negative,
  DROP CONSTRAINT IF EXISTS chk_cost_price_non_negative,
  DROP CONSTRAINT IF EXISTS chk_minus_description_consistency;

ALTER TABLE public.stock_units
  ADD CONSTRAINT chk_selling_price_non_negative
    CHECK (selling_price IS NULL OR selling_price >= 0),
  ADD CONSTRAINT chk_cost_price_non_negative
    CHECK (cost_price IS NULL OR cost_price >= 0),
  ADD CONSTRAINT chk_minus_description_consistency
    CHECK (
      (condition_status = 'minus' AND minus_description IS NOT NULL)
      OR (condition_status = 'no_minus')
    );

-- 3. Index for sold_channel queries
CREATE INDEX IF NOT EXISTS idx_stock_units_sold_channel
  ON public.stock_units (sold_channel);

-- 4. State transition + sold validation trigger (replace old one if exists)
DROP TRIGGER IF EXISTS trg_validate_stock_status ON public.stock_units;
DROP FUNCTION IF EXISTS public.validate_stock_status_transition();

CREATE OR REPLACE FUNCTION public.validate_stock_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Block invalid transitions from terminal states
  IF OLD.stock_status = 'sold' AND NEW.stock_status NOT IN ('sold', 'return') THEN
    RAISE EXCEPTION 'Invalid transition: cannot move from SOLD to %. Only RETURN is allowed.', NEW.stock_status;
  END IF;

  IF OLD.stock_status = 'lost' AND NEW.stock_status != 'lost' THEN
    RAISE EXCEPTION 'Invalid transition: LOST status is terminal and cannot be changed.';
  END IF;

  -- When moving to SOLD: require sold_channel, set sold_at
  IF NEW.stock_status = 'sold' THEN
    IF NEW.sold_channel IS NULL THEN
      RAISE EXCEPTION 'sold_channel is required when status is SOLD';
    END IF;
    NEW.sold_at = now();
  END IF;

  -- When moving to RESERVED: set reserved_at
  IF NEW.stock_status = 'reserved' AND OLD.stock_status != 'reserved' THEN
    NEW.reserved_at = now();
  END IF;

  -- When leaving RESERVED: clear reserved_at
  IF OLD.stock_status = 'reserved' AND NEW.stock_status != 'reserved' THEN
    NEW.reserved_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_stock_status
  BEFORE UPDATE ON public.stock_units
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_stock_status_transition();

-- 5. Update audit log trigger to capture changed_by
DROP TRIGGER IF EXISTS trg_stock_unit_audit ON public.stock_units;
DROP FUNCTION IF EXISTS public.log_stock_unit_status_change();

CREATE OR REPLACE FUNCTION public.log_stock_unit_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.stock_status IS DISTINCT FROM NEW.stock_status THEN
    INSERT INTO public.stock_unit_logs (unit_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'stock_status', OLD.stock_status::text, NEW.stock_status::text);
    NEW.status_changed_at = now();
  END IF;

  IF OLD.selling_price IS DISTINCT FROM NEW.selling_price THEN
    INSERT INTO public.stock_unit_logs (unit_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'selling_price', OLD.selling_price::text, NEW.selling_price::text);
  END IF;

  IF OLD.condition_status IS DISTINCT FROM NEW.condition_status THEN
    INSERT INTO public.stock_unit_logs (unit_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'condition_status', OLD.condition_status::text, NEW.condition_status::text);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_stock_unit_audit
  BEFORE UPDATE ON public.stock_units
  FOR EACH ROW
  EXECUTE FUNCTION public.log_stock_unit_status_change();

-- 6. Fix stock_unit_logs RLS: drop over-permissive policy, restrict to super_admin only
--    (triggers with SECURITY DEFINER bypass RLS, so they still work)
DROP POLICY IF EXISTS "superadmin_insert_logs" ON public.stock_unit_logs;
DROP POLICY IF EXISTS "authenticated_insert_logs" ON public.stock_unit_logs;

CREATE POLICY "superadmin_insert_logs"
  ON public.stock_unit_logs
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 7. Prevent UPDATE and DELETE on audit logs (immutable audit trail)
REVOKE UPDATE, DELETE ON public.stock_unit_logs FROM authenticated;

-- 8. Create sales view (hides IMEI and cost_price for non-super_admin consumers)
DROP VIEW IF EXISTS public.stock_units_sales_view;
CREATE VIEW public.stock_units_sales_view AS
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
