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
    const enabled = Deno.env.get("BOOTSTRAP_SUPERADMIN_ENABLED");
    if (enabled !== "true") {
      return new Response(
        JSON.stringify({ error: "Bootstrap is disabled" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const email = Deno.env.get("BOOTSTRAP_SUPERADMIN_EMAIL");
    const password = Deno.env.get("BOOTSTRAP_SUPERADMIN_PASSWORD");

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "Bootstrap credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Always find or create user in auth, and ALWAYS sync password
    const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    const existingAuthUser = users?.find((u: { email?: string }) => u.email === email);

    let userId: string;

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      // Always update password and confirm email
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
    } else {
      // Create new auth user
      const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Super Admin" },
      });
      if (createError) throw createError;
      userId = userData.user!.id;
    }

    // Upsert profile status to active
    await supabaseAdmin
      .from("user_profiles")
      .upsert({ id: userId, email, status: "active", full_name: "Super Admin" }, { onConflict: "id" });

    // Assign super_admin role - delete existing then insert
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "super_admin" });

    return new Response(
      JSON.stringify({ success: true, message: "Super admin synced successfully", userId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
