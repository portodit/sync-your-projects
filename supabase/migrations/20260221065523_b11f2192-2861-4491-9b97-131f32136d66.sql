-- Add shipping fields to transactions
ALTER TABLE public.transactions 
ADD COLUMN IF NOT EXISTS shipping_cost numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_courier text,
ADD COLUMN IF NOT EXISTS shipping_service text,
ADD COLUMN IF NOT EXISTS shipping_etd text,
ADD COLUMN IF NOT EXISTS shipping_discount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_address text,
ADD COLUMN IF NOT EXISTS shipping_city text,
ADD COLUMN IF NOT EXISTS shipping_province text,
ADD COLUMN IF NOT EXISTS shipping_postal_code text,
ADD COLUMN IF NOT EXISTS shipping_district text,
ADD COLUMN IF NOT EXISTS shipping_village text;

-- Add shipping_subsidy to discount_type enum
ALTER TYPE public.discount_type ADD VALUE IF NOT EXISTS 'shipping_subsidy';

-- Add shipping subsidy fields to discount_codes
ALTER TABLE public.discount_codes
ADD COLUMN IF NOT EXISTS shipping_subsidy_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS shipping_subsidy_unlimited boolean DEFAULT false;