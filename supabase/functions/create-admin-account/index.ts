import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get caller's role
    const { data: callerRoleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    const callerRole = callerRoleData?.role;
    const isSuperAdmin = callerRole === "super_admin";
    const isAdminBranch = callerRole === "admin_branch";

    if (!isSuperAdmin && !isAdminBranch) {
      return new Response(JSON.stringify({ error: "Forbidden: requires super_admin or admin_branch" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { full_name, email, password, role, branch_id } = await req.json();

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role validation based on caller
    const validRoles = ["super_admin", "admin_branch", "employee"];
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin branch can only create employee accounts at their own branch
    if (isAdminBranch) {
      if (role !== "employee") {
        return new Response(JSON.stringify({ error: "Admin cabang hanya dapat membuat akun employee." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!branch_id) {
        return new Response(JSON.stringify({ error: "Branch ID wajib diisi." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Verify caller has access to this branch
      const { data: callerBranches } = await supabaseAdmin
        .from("user_branches")
        .select("branch_id")
        .eq("user_id", caller.id);
      const callerBranchIds = (callerBranches ?? []).map((b: { branch_id: string }) => b.branch_id);
      if (!callerBranchIds.includes(branch_id)) {
        return new Response(JSON.stringify({ error: "Anda tidak memiliki akses ke cabang ini." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // For admin_branch and employee roles, branch_id is required
    if ((role === "admin_branch" || role === "employee") && !branch_id) {
      return new Response(JSON.stringify({ error: "Pilih cabang untuk role ini." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the user via admin API (no email verification needed)
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip email verification
      user_metadata: { full_name: full_name || email.split("@")[0] },
    });

    if (createErr || !newUser?.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Failed to create user" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = newUser.user.id;

    // Upsert profile (trigger may not have fired yet)
    await supabaseAdmin
      .from("user_profiles")
      .upsert({
        id: userId,
        email,
        full_name: full_name || email.split("@")[0],
        status: "active",
      }, { onConflict: "id" });

    // Assign role
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });

    // Assign to branch if needed
    if (branch_id && (role === "admin_branch" || role === "employee")) {
      await supabaseAdmin
        .from("user_branches")
        .insert({ user_id: userId, branch_id, is_default: true, assigned_by: caller.id });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
