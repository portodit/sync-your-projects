import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TRIPAY_BASE = "https://tripay.co.id/api-sandbox";

async function fetchByMerchantRef(apiKey: string, merchantRef: string) {
  const res = await fetch(
    `${TRIPAY_BASE}/merchant/transactions?merchant_ref=${encodeURIComponent(merchantRef)}&per_page=1`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  const text = await res.text();
  let json: { success?: boolean; data?: unknown[] };
  try {
    json = JSON.parse(text);
  } catch {
    console.error("TriPay non-JSON response for merchant_ref", merchantRef, ":", text.slice(0, 200));
    return null;
  }
  if (json.success && Array.isArray(json.data) && json.data.length > 0) return json.data[0];
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const TRIPAY_API_KEY = Deno.env.get("TRIPAY_API_KEY");
    if (!TRIPAY_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "TriPay credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { transactionCode, transactionId } = await req.json();
    if (!transactionCode) {
      return new Response(
        JSON.stringify({ success: false, error: "transactionCode is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("Checking TriPay status for:", transactionCode);

    const results: unknown[] = [];

    // 1. Try base merchant_ref first (single payment)
    const baseData = await fetchByMerchantRef(TRIPAY_API_KEY, transactionCode);
    if (baseData) {
      console.log("Found single transaction:", transactionCode);
      results.push(baseData);
    } else {
      // 2. Try split refs sequentially: -1, -2, ... up to 20
      console.log("Single not found, trying split refs for:", transactionCode);
      for (let i = 1; i <= 20; i++) {
        const data = await fetchByMerchantRef(TRIPAY_API_KEY, `${transactionCode}-${i}`);
        if (!data) break;
        results.push(data);
      }
      console.log(`Found ${results.length} split transaction(s) for:`, transactionCode);
    }

    // ── Auto-sync: if ALL parts are PAID → mark transaction completed in DB ──
    // IMPORTANT: Only auto-complete if transaction is still "pending".
    // If it's been cancelled in Ivalora Gadget, do NOT reactivate it even if TriPay shows PAID.
    if (results.length > 0) {
      const allPaid = results.every((t: unknown) => (t as { status: string }).status === "PAID");
      if (allPaid && transactionId) {
        // First check current transaction status
        const { data: currentTx } = await supabase
          .from("transactions")
          .select("status")
          .eq("id", transactionId)
          .single();

        const currentStatus = (currentTx as { status: string } | null)?.status;

        if (currentStatus === "cancelled") {
          console.log("Transaction already cancelled in system, ignoring TriPay PAID status:", transactionId);
        } else if (currentStatus === "pending") {
          console.log("All parts PAID. Updating transaction to completed:", transactionId);
          const { error: updateErr } = await supabase
            .from("transactions")
            .update({
              status: "completed",
              confirmed_at: new Date().toISOString(),
              confirmed_by: user.id,
            })
            .eq("id", transactionId)
            .eq("status", "pending");
          if (updateErr) {
            console.error("Failed to update transaction status:", updateErr.message);
          } else {
            console.log("Transaction marked as completed:", transactionId);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, data: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("tripay-check-status error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
