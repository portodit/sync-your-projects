
-- Add qris_image_url column to payment_methods
ALTER TABLE public.payment_methods ADD COLUMN IF NOT EXISTS qris_image_url text;

-- Create storage bucket for payment method images (QRIS codes etc)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-method-images', 'payment-method-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to payment-method-images bucket
CREATE POLICY "Authenticated users can upload payment method images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'payment-method-images');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update payment method images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'payment-method-images');

-- Allow authenticated users to delete payment method images
CREATE POLICY "Authenticated users can delete payment method images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'payment-method-images');

-- Allow public read access for payment method images
CREATE POLICY "Public read access for payment method images"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-method-images');
