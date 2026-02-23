import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonRes({ error: "Unauthorized" }, 401);

    const token = authHeader.replace("Bearer ", "");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Validate caller using token directly
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.admin.getUserById(
      // First decode the token to get user id
      (() => {
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          return payload.sub;
        } catch {
          return "";
        }
      })()
    );

    if (authError || !caller) {
      // Fallback: try getUser with anon client
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user: fallbackUser } } = await anonClient.auth.getUser(token);
      if (!fallbackUser) return jsonRes({ error: "Invalid token" }, 401);
      // Use fallbackUser
      return await handleRequest(req, supabaseAdmin, fallbackUser);
    }

    return await handleRequest(req, supabaseAdmin, caller);
  } catch (error) {
    console.error("manage-customer error:", error);
    return jsonRes({ error: error.message }, 500);
  }
});

async function handleRequest(req: Request, supabaseAdmin: ReturnType<typeof createClient>, caller: { id: string }) {
  // Get caller role
  const { data: callerRole } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .single();

  const role = callerRole?.role;
  const isAdminOrAbove = ["super_admin", "admin_branch", "employee"].includes(role ?? "");

  const body = await req.json();
  const { action, user_id, email, password } = body;

  if (!action) return jsonRes({ error: "Missing action" }, 400);

  // ── lookup_customer_by_email ───────────────────────────────────────────
  if (action === "lookup_customer_by_email" && email) {
    if (!isAdminOrAbove) return jsonRes({ error: "Forbidden" }, 403);

    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("id, email, full_name, status")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (!profile) return jsonRes({ customer: null });

    const { data: custRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id)
      .eq("role", "customer")
      .single();

    if (!custRole) return jsonRes({ customer: null, error: "Bukan akun customer" });

    return jsonRes({
      customer: {
        id: profile.id,
        email: profile.email,
        name: profile.full_name ?? profile.email,
        status: profile.status,
      },
    });
  }

  // ── search_customers ───────────────────────────────────────────────────
  if (action === "search_customers") {
    if (!isAdminOrAbove) return jsonRes({ error: "Forbidden" }, 403);

    const keyword = (body.keyword ?? "").trim().toLowerCase();
    if (!keyword || keyword.length < 2) return jsonRes({ customers: [] });

    const { data: custRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "customer");
    const custIds = (custRoles ?? []).map((r: { user_id: string }) => r.user_id);
    if (custIds.length === 0) return jsonRes({ customers: [] });

    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("id, email, full_name, status")
      .in("id", custIds)
      .or(`full_name.ilike.%${keyword}%,email.ilike.%${keyword}%`)
      .limit(20);

    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const phoneMatches = (authUsers?.users ?? [])
      .filter((u) => custIds.includes(u.id) && u.phone && u.phone.includes(keyword))
      .map((u) => u.id);

    const profileIds = new Set((profiles ?? []).map((p) => p.id));
    const allIds = [...profileIds];
    for (const pid of phoneMatches) {
      if (!profileIds.has(pid)) allIds.push(pid);
    }

    let results: Array<{ id: string; email: string; name: string; phone: string | null }> = [];
    if (allIds.length > 0) {
      const { data: fullProfiles } = await supabaseAdmin
        .from("user_profiles")
        .select("id, email, full_name")
        .in("id", allIds)
        .limit(20);

      const phoneMap: Record<string, string | null> = {};
      for (const u of authUsers?.users ?? []) {
        if (allIds.includes(u.id)) phoneMap[u.id] = u.phone ?? null;
      }

      results = (fullProfiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        name: p.full_name ?? p.email,
        phone: phoneMap[p.id] ?? null,
      }));
    }

    return jsonRes({ customers: results });
  }

  // Admin-only actions below
  if (!["super_admin", "admin_branch"].includes(role ?? "")) {
    return jsonRes({ error: "Forbidden: admin only" }, 403);
  }

  // ── list_customers ─────────────────────────────────────────────────────
  if (action === "list_customers") {
    // Get admin user IDs to exclude
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "admin_branch", "employee", "web_admin"]);
    const adminIds = new Set((adminRoles ?? []).map((r: { user_id: string }) => r.user_id));

    // Get caller's branches for admin_branch
    let callerBranchIds: string[] = [];
    if (role === "admin_branch") {
      const { data: cb } = await supabaseAdmin
        .from("user_branches")
        .select("branch_id")
        .eq("user_id", caller.id);
      callerBranchIds = (cb ?? []).map((b: { branch_id: string }) => b.branch_id);
    }

    // Get all auth users
    const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    if (listErr) return jsonRes({ error: listErr.message }, 500);

    // Registered customers (have auth account + customer role or no admin role)
    const registeredCustomers = (listData?.users ?? [])
      .filter((u) => !adminIds.has(u.id))
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        full_name: u.user_metadata?.full_name ?? null,
        phone: u.phone ?? null,
        email_confirmed: !!u.email_confirmed_at,
        email_confirmed_at: u.email_confirmed_at,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        has_account: true,
        source: "website" as const,
      }));

    // Get profiles
    const customerIds = registeredCustomers.map((c) => c.id);
    const { data: profiles } = await supabaseAdmin
      .from("user_profiles")
      .select("id, status, full_name")
      .in("id", customerIds.length > 0 ? customerIds : ["_none_"]);

    const profileMap: Record<string, { status: string; full_name: string | null }> = {};
    for (const p of profiles ?? []) {
      profileMap[p.id] = { status: p.status, full_name: p.full_name };
    }

    // Get POS transaction customers (may not have accounts)
    let txQuery = supabaseAdmin
      .from("transactions")
      .select("customer_email, customer_name, customer_phone, customer_user_id, branch_id, created_at")
      .not("customer_email", "is", null);

    if (role === "admin_branch" && callerBranchIds.length > 0) {
      txQuery = txQuery.in("branch_id", callerBranchIds);
    }

    const { data: txCustomers } = await txQuery;

    // Build unique POS-only customers (no auth account)
    const registeredIds = new Set(customerIds);
    const posCustomerMap = new Map<string, {
      email: string;
      name: string | null;
      phone: string | null;
      created_at: string;
      customer_user_id: string | null;
    }>();

    for (const tx of txCustomers ?? []) {
      const email = (tx.customer_email ?? "").toLowerCase().trim();
      if (!email) continue;
      if (!posCustomerMap.has(email)) {
        posCustomerMap.set(email, {
          email,
          name: tx.customer_name,
          phone: tx.customer_phone,
          created_at: tx.created_at,
          customer_user_id: tx.customer_user_id,
        });
      }
    }

    // POS customers without accounts
    const posOnlyCustomers = Array.from(posCustomerMap.values())
      .filter((pc) => !pc.customer_user_id || !registeredIds.has(pc.customer_user_id))
      .map((pc) => ({
        id: `pos_${pc.email}`,
        email: pc.email,
        full_name: pc.name,
        phone: pc.phone,
        email_confirmed: false,
        email_confirmed_at: null,
        created_at: pc.created_at,
        last_sign_in_at: null,
        has_account: false,
        source: "pos" as const,
        profile_status: "no_account",
      }));

    // Filter registered customers for admin_branch
    let filteredRegistered = registeredCustomers;
    if (role === "admin_branch") {
      const branchCustomerUserIds = new Set(
        (txCustomers ?? [])
          .filter((t) => t.customer_user_id)
          .map((t) => t.customer_user_id!)
      );
      filteredRegistered = registeredCustomers.filter((c) => branchCustomerUserIds.has(c.id));
    }

    const result = [
      ...filteredRegistered.map((c) => ({
        ...c,
        profile_status: profileMap[c.id]?.status ?? "unknown",
        full_name: c.full_name ?? profileMap[c.id]?.full_name ?? null,
      })),
      ...posOnlyCustomers,
    ];

    return jsonRes({ customers: result });
  }

  // ── verify_email ───────────────────────────────────────────────────────
  if (action === "verify_email" && user_id) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { email_confirm: true });
    if (error) return jsonRes({ error: error.message }, 400);
    await supabaseAdmin.from("user_profiles").update({ status: "active" }).eq("id", user_id);
    return jsonRes({ success: true });
  }

  // ── update_email ───────────────────────────────────────────────────────
  if (action === "update_email" && user_id && email) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { email, email_confirm: true });
    if (error) return jsonRes({ error: error.message }, 400);
    await supabaseAdmin.from("user_profiles").update({ email }).eq("id", user_id);
    return jsonRes({ success: true });
  }

  // ── update_password ────────────────────────────────────────────────────
  if (action === "update_password" && user_id && password) {
    if (password.length < 8) return jsonRes({ error: "Password minimal 8 karakter" }, 400);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(user_id, { password });
    if (error) return jsonRes({ error: error.message }, 400);
    return jsonRes({ success: true });
  }

  // ── suspend ────────────────────────────────────────────────────────────
  if (action === "suspend" && user_id) {
    await supabaseAdmin.from("user_profiles").update({ status: "suspended" }).eq("id", user_id);
    await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "876600h" });
    return jsonRes({ success: true });
  }

  // ── activate ───────────────────────────────────────────────────────────
  if (action === "activate" && user_id) {
    await supabaseAdmin.from("user_profiles").update({ status: "active" }).eq("id", user_id);
    await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: "none" });
    return jsonRes({ success: true });
  }

  // ── delete ─────────────────────────────────────────────────────────────
  if (action === "delete" && user_id) {
    await supabaseAdmin.auth.admin.deleteUser(user_id);
    return jsonRes({ success: true });
  }

  return jsonRes({ error: "Unknown action" }, 400);
}
