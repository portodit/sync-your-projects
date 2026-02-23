-- Fix duplicate SELECT policies on bonus_products
-- Keep only the public read policy (covers both anon and authenticated)
DROP POLICY IF EXISTS "authenticated_read_bonus_products" ON public.bonus_products;
-- Now public_read_bonus_products handles all SELECT (is_active = true)
-- Authenticated users and super_admins are covered by the superadmin_manage_bonus_products ALL policy
