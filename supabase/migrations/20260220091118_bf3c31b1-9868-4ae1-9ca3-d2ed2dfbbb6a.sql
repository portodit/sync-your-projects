
-- Create payment_methods table for branch-specific payment channels
CREATE TABLE public.payment_methods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. "BCA Transfer", "GoPay", "Tunai"
  type TEXT NOT NULL DEFAULT 'bank_transfer', -- 'cash' | 'bank_transfer' | 'ewallet' | 'other'
  bank_name TEXT NULL, -- e.g. "BCA", "BNI", "Mandiri"
  account_number TEXT NULL,
  account_name TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- Public read for active payment methods (for POS)
CREATE POLICY "branch_read_own_payment_methods"
ON public.payment_methods FOR SELECT
USING (
  (has_role(auth.uid(), 'admin_branch'::app_role) AND branch_id IN (SELECT get_user_branch_ids(auth.uid())))
  OR (has_role(auth.uid(), 'employee'::app_role) AND branch_id IN (SELECT get_user_branch_ids(auth.uid())))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- Admin branch manage their own branch payment methods
CREATE POLICY "admin_branch_manage_payment_methods"
ON public.payment_methods FOR ALL
USING (
  has_role(auth.uid(), 'admin_branch'::app_role) AND branch_id IN (SELECT get_user_branch_ids(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin_branch'::app_role) AND branch_id IN (SELECT get_user_branch_ids(auth.uid()))
);

-- Super admin can manage all payment methods
CREATE POLICY "superadmin_manage_payment_methods"
ON public.payment_methods FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Create transactions table for POS sales
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  transaction_code TEXT NULL, -- e.g. TRX-20260220-001
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'completed' | 'cancelled'
  
  -- Customer info
  customer_user_id UUID NULL, -- references auth.users if customer has account
  customer_name TEXT NULL, -- for walk-in customers
  customer_email TEXT NULL,
  customer_phone TEXT NULL,
  
  -- Payment
  payment_method_id UUID NULL REFERENCES public.payment_methods(id),
  payment_method_name TEXT NULL, -- snapshot
  discount_code TEXT NULL,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  
  -- Meta
  notes TEXT NULL,
  created_by UUID NULL,
  confirmed_by UUID NULL,
  confirmed_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_read_own_transactions"
ON public.transactions FOR SELECT
USING (
  (has_role(auth.uid(), 'admin_branch'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND branch_id IN (SELECT get_user_branch_ids(auth.uid()))
);

CREATE POLICY "branch_insert_transactions"
ON public.transactions FOR INSERT
WITH CHECK (
  ((has_role(auth.uid(), 'admin_branch'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND branch_id IN (SELECT get_user_branch_ids(auth.uid())))
);

CREATE POLICY "branch_update_transactions"
ON public.transactions FOR UPDATE
USING (
  (has_role(auth.uid(), 'admin_branch'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
  AND branch_id IN (SELECT get_user_branch_ids(auth.uid()))
);

CREATE POLICY "superadmin_manage_transactions"
ON public.transactions FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Transaction items (each IMEI unit sold)
CREATE TABLE public.transaction_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  stock_unit_id UUID NOT NULL REFERENCES public.stock_units(id),
  imei TEXT NOT NULL,
  product_label TEXT NOT NULL, -- e.g. "iPhone 13 Pro 256GB Graphite"
  selling_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transaction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_read_transaction_items"
ON public.transaction_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_items.transaction_id
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        (has_role(auth.uid(), 'admin_branch'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
        AND t.branch_id IN (SELECT get_user_branch_ids(auth.uid()))
      )
    )
  )
);

CREATE POLICY "branch_insert_transaction_items"
ON public.transaction_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.id = transaction_items.transaction_id
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (
        (has_role(auth.uid(), 'admin_branch'::app_role) OR has_role(auth.uid(), 'employee'::app_role))
        AND t.branch_id IN (SELECT get_user_branch_ids(auth.uid()))
      )
    )
  )
);

CREATE POLICY "superadmin_manage_transaction_items"
ON public.transaction_items FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_payment_methods_updated_at
BEFORE UPDATE ON public.payment_methods
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at
BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
