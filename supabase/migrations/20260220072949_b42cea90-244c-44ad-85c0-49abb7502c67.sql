-- ============================================================
-- FIX: Drop all opname_sessions RLS policies to eliminate recursion
-- ============================================================
DROP POLICY IF EXISTS "assigned_admin_update_sessions" ON public.opname_sessions;
DROP POLICY IF EXISTS "assigned_admin_view_sessions" ON public.opname_sessions;
DROP POLICY IF EXISTS "authenticated_insert_opname_sessions" ON public.opname_sessions;
DROP POLICY IF EXISTS "authenticated_read_opname_sessions" ON public.opname_sessions;
DROP POLICY IF EXISTS "authenticated_update_opname_sessions" ON public.opname_sessions;
DROP POLICY IF EXISTS "branch_scoped_insert_opname" ON public.opname_sessions;
DROP POLICY IF EXISTS "branch_scoped_read_opname" ON public.opname_sessions;
DROP POLICY IF EXISTS "branch_scoped_update_opname" ON public.opname_sessions;
DROP POLICY IF EXISTS "superadmin_delete_opname_sessions" ON public.opname_sessions;

-- Create a security definer helper: check if user is assigned to a session
CREATE OR REPLACE FUNCTION public.is_assigned_to_session(_session_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.opname_session_assignments
    WHERE session_id = _session_id AND admin_id = _user_id
  );
$$;

-- ─── SELECT ───────────────────────────────────────────────────────────────────
-- Super admin sees all
CREATE POLICY "superadmin_select_opname_sessions"
ON public.opname_sessions FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- Branch-scoped users (admin_branch, employee) see only their branch sessions
CREATE POLICY "branch_select_opname_sessions"
ON public.opname_sessions FOR SELECT
USING (
  (has_role(auth.uid(), 'admin_branch') OR has_role(auth.uid(), 'employee'))
  AND branch_id IN (SELECT get_user_branch_ids(auth.uid()))
);

-- Assigned admins/employees can see their assigned sessions
CREATE POLICY "assigned_select_opname_sessions"
ON public.opname_sessions FOR SELECT
USING (
  is_assigned_to_session(id, auth.uid())
);

-- ─── INSERT ───────────────────────────────────────────────────────────────────
-- Super admin can insert sessions for any branch
CREATE POLICY "superadmin_insert_opname_sessions"
ON public.opname_sessions FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Admin branch can insert sessions for their own branches
CREATE POLICY "admin_branch_insert_opname_sessions"
ON public.opname_sessions FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin_branch')
  AND branch_id IN (SELECT get_user_branch_ids(auth.uid()))
);

-- ─── UPDATE ───────────────────────────────────────────────────────────────────
-- Super admin can update any session
CREATE POLICY "superadmin_update_opname_sessions"
ON public.opname_sessions FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'));

-- Admin branch can update sessions in their branch
CREATE POLICY "admin_branch_update_opname_sessions"
ON public.opname_sessions FOR UPDATE
USING (
  has_role(auth.uid(), 'admin_branch')
  AND branch_id IN (SELECT get_user_branch_ids(auth.uid()))
);

-- Assigned users can update their assigned sessions
CREATE POLICY "assigned_update_opname_sessions"
ON public.opname_sessions FOR UPDATE
USING (is_assigned_to_session(id, auth.uid()));

-- ─── DELETE ───────────────────────────────────────────────────────────────────
CREATE POLICY "superadmin_delete_opname_sessions"
ON public.opname_sessions FOR DELETE
USING (has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- FIX master_products: block admin_branch from UPDATE & DELETE
-- ============================================================
DROP POLICY IF EXISTS "superadmin_update_products" ON public.master_products;
DROP POLICY IF EXISTS "admin_branch_update_master_products" ON public.master_products;

-- Only super_admin can update master products
CREATE POLICY "superadmin_update_products"
ON public.master_products FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- No DELETE for admin_branch (super_admin only — existing policy stays)
-- Ensure admin_branch CANNOT delete
DROP POLICY IF EXISTS "admin_branch_delete_master_products" ON public.master_products;