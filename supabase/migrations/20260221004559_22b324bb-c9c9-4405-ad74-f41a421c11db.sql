
-- Allow sold units without sold_channel (so admin can assign later)
CREATE OR REPLACE FUNCTION public.validate_stock_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Block invalid transitions from terminal states
  IF OLD.stock_status = 'sold' AND NEW.stock_status NOT IN ('sold', 'return') THEN
    RAISE EXCEPTION 'Invalid transition: cannot move from SOLD to %. Only RETURN is allowed.', NEW.stock_status;
  END IF;

  IF OLD.stock_status = 'lost' AND NEW.stock_status != 'lost' THEN
    RAISE EXCEPTION 'Invalid transition: LOST status is terminal and cannot be changed.';
  END IF;

  -- When moving to SOLD: set sold_at (sold_channel is now optional)
  IF NEW.stock_status = 'sold' AND OLD.stock_status != 'sold' THEN
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
$function$;
