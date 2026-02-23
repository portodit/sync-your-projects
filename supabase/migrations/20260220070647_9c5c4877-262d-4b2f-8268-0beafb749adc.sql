
-- Fix infinite recursion in opname_sessions RLS policies
-- The bug is in assigned_admin_update_sessions and assigned_admin_view_sessions 
-- where they reference opname_session_assignments.id instead of opname_sessions.id

-- Drop buggy policies
DROP POLICY IF EXISTS "assigned_admin_update_sessions" ON public.opname_sessions;
DROP POLICY IF EXISTS "assigned_admin_view_sessions" ON public.opname_sessions;

-- Recreate fixed policies (was referencing assignments.id instead of assignments.session_id)
CREATE POLICY "assigned_admin_update_sessions"
ON public.opname_sessions
FOR UPDATE
USING (
  (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'super_admin'))
  OR
  (EXISTS (SELECT 1 FROM opname_session_assignments 
           WHERE opname_session_assignments.session_id = opname_sessions.id 
           AND opname_session_assignments.admin_id = auth.uid()))
);

CREATE POLICY "assigned_admin_view_sessions"
ON public.opname_sessions
FOR SELECT
USING (
  (auth.uid() = created_by)
  OR
  (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'super_admin'))
  OR
  (EXISTS (SELECT 1 FROM opname_session_assignments 
           WHERE opname_session_assignments.session_id = opname_sessions.id 
           AND opname_session_assignments.admin_id = auth.uid()))
);
