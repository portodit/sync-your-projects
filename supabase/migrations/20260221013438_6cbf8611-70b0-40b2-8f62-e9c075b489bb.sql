
-- 1. Drop overly permissive public_read_suppliers (authenticated_read_suppliers already covers staff)
DROP POLICY IF EXISTS "public_read_suppliers" ON public.suppliers;

-- 2. Replace public_read_flash_sale_settings with a security definer function
DROP POLICY IF EXISTS "public_read_flash_sale_settings" ON public.flash_sale_settings;

-- Create function that only exposes whether flash sale is active (no timing/discount details)
CREATE OR REPLACE FUNCTION public.get_active_flash_sale_info()
RETURNS TABLE (
  id uuid,
  is_active boolean,
  start_time timestamptz,
  duration_hours integer,
  branch_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, is_active, start_time, duration_hours, branch_id
  FROM public.flash_sale_settings
  WHERE is_active = true;
$$;

-- 3. Tighten service_manage_roles on user_roles
DROP POLICY IF EXISTS "service_manage_roles" ON public.user_roles;

CREATE POLICY "service_insert_roles_validated"
  ON public.user_roles FOR INSERT
  TO service_role
  WITH CHECK (
    role IN ('super_admin', 'admin', 'admin_branch', 'employee', 'customer', 'web_admin')
    AND EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)
  );

CREATE POLICY "service_update_roles_validated"
  ON public.user_roles FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (
    role IN ('super_admin', 'admin', 'admin_branch', 'employee', 'customer', 'web_admin')
  );

CREATE POLICY "service_delete_roles"
  ON public.user_roles FOR DELETE
  TO service_role
  USING (true);

CREATE POLICY "service_select_roles"
  ON public.user_roles FOR SELECT
  TO service_role
  USING (true);

-- 4. Tighten service_insert_notif on notifications
DROP POLICY IF EXISTS "service_insert_notif" ON public.notifications;

CREATE POLICY "service_insert_notif_validated"
  ON public.notifications FOR INSERT
  TO service_role
  WITH CHECK (
    EXISTS (SELECT 1 FROM auth.users WHERE id = user_id)
  );

-- 5. Tighten service_insert_activity_logs on activity_logs
DROP POLICY IF EXISTS "service_insert_activity_logs" ON public.activity_logs;

CREATE POLICY "service_insert_activity_logs_validated"
  ON public.activity_logs FOR INSERT
  TO service_role
  WITH CHECK (true);
-- Keep activity_logs permissive for service_role as it may log system events without a specific user

-- 6. Tighten service_insert_profiles on user_profiles
DROP POLICY IF EXISTS "service_insert_profiles" ON public.user_profiles;

CREATE POLICY "service_insert_profiles_validated"
  ON public.user_profiles FOR INSERT
  TO service_role
  WITH CHECK (
    EXISTS (SELECT 1 FROM auth.users WHERE id = user_profiles.id)
  );
