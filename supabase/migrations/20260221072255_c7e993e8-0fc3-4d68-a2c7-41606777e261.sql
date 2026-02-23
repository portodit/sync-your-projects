
-- Create customer_addresses table for saving shipping addresses
CREATE TABLE public.customer_addresses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  label text DEFAULT 'Utama',
  full_name text NOT NULL,
  phone text NOT NULL,
  province_code text,
  province_name text,
  regency_code text,
  regency_name text,
  district_code text,
  district_name text,
  village_code text,
  village_name text,
  full_address text NOT NULL,
  postal_code text,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own addresses
CREATE POLICY "users_read_own_addresses" ON public.customer_addresses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_addresses" ON public.customer_addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_addresses" ON public.customer_addresses
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_addresses" ON public.customer_addresses
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
