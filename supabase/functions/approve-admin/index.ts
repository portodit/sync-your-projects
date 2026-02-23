import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller identity
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check caller role
    const { data: callerRoleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const callerRole = callerRoleData?.role;
    const isSuperAdmin = callerRole === "super_admin";
    const isAdminBranch = callerRole === "admin_branch";

    if (!isSuperAdmin && !isAdminBranch) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { target_user_id, action } = await req.json();
    if (!target_user_id || !["approve", "reject", "suspend"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target user metadata to check requested branch
    const { data: { user: targetUser } } = await supabaseAdmin.auth.admin.getUserById(target_user_id);
    const metadata = targetUser?.user_metadata ?? {};
    const requestedRole = metadata.requested_role;
    const requestedBranchId = metadata.requested_branch_id;

    // Admin branch can only approve employees in their own branch
    if (isAdminBranch && !isSuperAdmin) {
      // Get caller's branches
      const { data: callerBranches } = await supabaseAdmin
        .from("user_branches")
        .select("branch_id")
        .eq("user_id", caller.id);
      const callerBranchIds = (callerBranches ?? []).map((b: { branch_id: string }) => b.branch_id);

      // Admin branch can only approve employees for their branch
      if (!requestedBranchId || !callerBranchIds.includes(requestedBranchId)) {
        return new Response(JSON.stringify({ error: "Anda hanya dapat menyetujui akun untuk cabang Anda." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Admin branch can only approve employee or admin_branch roles
      if (requestedRole && !["employee", "admin_branch"].includes(requestedRole)) {
        return new Response(JSON.stringify({ error: "Anda tidak dapat menyetujui role ini." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const statusMap: Record<string, string> = {
      approve: "active",
      reject: "rejected",
      suspend: "suspended",
    };

    const { error: updateError } = await supabaseAdmin
      .from("user_profiles")
      .update({ status: statusMap[action] })
      .eq("id", target_user_id);

    if (updateError) throw updateError;

    // If approving, assign role and branch from user metadata
    if (action === "approve") {
      const validRoles = ["admin_branch", "employee", "web_admin"];
      const role = validRoles.includes(requestedRole) ? requestedRole : "admin_branch";

      // Assign role
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: target_user_id, role }, { onConflict: "user_id,role" });

      // Assign branch if provided
      if (requestedBranchId) {
        const { data: branch } = await supabaseAdmin
          .from("branches")
          .select("id")
          .eq("id", requestedBranchId)
          .eq("is_active", true)
          .single();

        if (branch) {
          await supabaseAdmin
            .from("user_branches")
            .upsert(
              { user_id: target_user_id, branch_id: requestedBranchId, is_default: true, assigned_by: caller.id },
              { onConflict: "user_id,branch_id" }
            );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, status: statusMap[action] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
