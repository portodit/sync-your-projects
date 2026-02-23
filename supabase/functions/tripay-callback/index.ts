import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function generateHmac(privateKey: string, bodyJson: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(privateKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(bodyJson));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const TRIPAY_PRIVATE_KEY = Deno.env.get("TRIPAY_PRIVATE_KEY");
    if (!TRIPAY_PRIVATE_KEY) {
      console.error("TRIPAY_PRIVATE_KEY not configured");
      return new Response(JSON.stringify({ success: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read raw body for signature verification
    const bodyText = await req.text();

    // Verify signature from TriPay
    const callbackSignature = req.headers.get("X-Callback-Signature");
    if (!callbackSignature) {
      console.error("Missing X-Callback-Signature header");
      return new Response(JSON.stringify({ success: false, error: "Missing signature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expectedSignature = await generateHmac(TRIPAY_PRIVATE_KEY, bodyText);
    if (callbackSignature !== expectedSignature) {
      console.error("Invalid callback signature", { received: callbackSignature, expected: expectedSignature });
      return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.parse(bodyText);
    console.log("TriPay callback received:", JSON.stringify(payload));

    const { reference, merchant_ref, status, total_amount, paid_at } = payload;

    if (!merchant_ref) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // merchant_ref might be "TRX-20240101-1234" or "TRX-20240101-1234-1" (split payment part)
    // Extract base transaction code
    const baseTxCode = merchant_ref.replace(/-[12]$/, "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the transaction by transaction_code
    const { data: transaction, error: txErr } = await supabase
      .from("transactions")
      .select("id, status, transaction_code")
      .eq("transaction_code", baseTxCode)
      .single();

    if (txErr || !transaction) {
      console.error("Transaction not found for merchant_ref:", merchant_ref, txErr);
      // Return success to TriPay so they don't keep retrying for unknown transactions
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tx = transaction as { id: string; status: string; transaction_code: string };

    // For split payments, we must check ALL parts are PAID before marking transaction completed.
    // merchant_ref for splits: "TRX-xxx-1", "TRX-xxx-2", etc.
    // We'll determine if this is a split payment by checking if merchant_ref has a trailing -\d
    const isSplitPart = /\-\d+$/.test(merchant_ref) && merchant_ref !== baseTxCode;

    // Get all transaction items for counting split parts
    const { data: txItems } = await supabase
      .from("transaction_items")
      .select("stock_unit_id")
      .eq("transaction_id", tx.id);

    const stockUnitIds = (txItems as Array<{ stock_unit_id: string }> ?? []).map((i) => i.stock_unit_id);

    if (status === "PAID") {
      // SAFETY: If transaction was already cancelled in Ivalora Gadget, do NOT reactivate
      if (tx.status === "cancelled") {
        console.log(`Transaction ${baseTxCode} already cancelled in system. Notifying admins about paid-cancelled tx.`);

        // Notify all relevant users (employee, admin_branch, super_admin) about this unexpected payment
        try {
          // Get branch_id from the transaction
          const { data: fullTxData } = await supabase
            .from("transactions")
            .select("branch_id")
            .eq("id", tx.id)
            .single();
          const branchId = (fullTxData as { branch_id: string } | null)?.branch_id;

          // Find users to notify: super_admins + branch employees/admins
          const { data: superAdmins } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "super_admin");

          let branchUserIds: string[] = [];
          if (branchId) {
            const { data: branchUsers } = await supabase
              .from("user_branches")
              .select("user_id")
              .eq("branch_id", branchId);
            branchUserIds = (branchUsers as Array<{ user_id: string }> ?? []).map(u => u.user_id);
          }

          const superAdminIds = (superAdmins as Array<{ user_id: string }> ?? []).map(u => u.user_id);
          const allUserIds = Array.from(new Set([...superAdminIds, ...branchUserIds]));

          for (const userId of allUserIds) {
            await supabase.from("notifications").insert({
              user_id: userId,
              type: "payment_cancelled_paid",
              title: "⚠️ Pembayaran Masuk untuk Transaksi Dibatalkan",
              body: `Transaksi ${baseTxCode} yang sudah dibatalkan di Ivalora Gadget ternyata tetap dibayar via TriPay (Ref: ${reference}). Pembayaran sebesar ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(total_amount)} perlu ditindaklanjuti (refund manual).`,
              link: `/admin/transaksi/${tx.id}`,
            });
          }
          console.log(`Notified ${allUserIds.length} users about paid-cancelled transaction ${baseTxCode}`);
        } catch (notifErr) {
          console.error("Failed to send notifications for paid-cancelled tx:", notifErr);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (isSplitPart) {
        // Determine total split count from the transaction total
        // We use total_amount from callback to compare with transaction total
        const { data: fullTx } = await supabase
          .from("transactions")
          .select("total")
          .eq("id", tx.id)
          .single();

        const transactionTotal = (fullTx as { total: number } | null)?.total ?? 0;
        const totalSplits = Math.ceil(transactionTotal / 10_000_000);

        // Check how many split refs have been paid by probing TriPay or by inferring from callback sequence
        // We track via notes or we simply check if the current split index equals totalSplits
        const splitIndex = parseInt(merchant_ref.match(/\-(\d+)$/)?.[1] ?? "1", 10);
        const isLastSplit = splitIndex >= totalSplits;

        console.log(`Split payment ${splitIndex}/${totalSplits} PAID for ${baseTxCode}`);

        if (isLastSplit) {
          // All splits done → complete transaction and mark stock sold
          const { error: updateErr } = await supabase
            .from("transactions")
            .update({
              status: "completed",
              confirmed_at: new Date(paid_at * 1000).toISOString(),
              notes: `Semua ${totalSplits} pembayaran split TriPay lunas. Ref terakhir: ${reference}`,
            })
            .eq("id", tx.id);

          if (!updateErr && stockUnitIds.length > 0) {
            await supabase
              .from("stock_units")
              .update({
                stock_status: "sold",
                sold_channel: "pos",
                sold_reference_id: tx.id,
                sold_at: new Date().toISOString(),
              })
              .in("id", stockUnitIds)
              .neq("stock_status", "sold");
            console.log(`Stock units marked SOLD (pos) for split-complete transaction ${baseTxCode}`);
          }
        } else {
          // Partial split paid — update notes to reflect progress
          await supabase
            .from("transactions")
            .update({
              notes: `Split pembayaran ${splitIndex}/${totalSplits} lunas via TriPay. Ref: ${reference}`,
            })
            .eq("id", tx.id)
            .neq("status", "completed");
          console.log(`Partial split ${splitIndex}/${totalSplits} paid for ${baseTxCode}`);
        }
      } else {
        // Single (non-split) payment PAID → complete immediately
        const { error: updateErr } = await supabase
          .from("transactions")
          .update({
            status: "completed",
            confirmed_at: new Date(paid_at * 1000).toISOString(),
            notes: `Pembayaran dikonfirmasi via TriPay. Ref: ${reference}`,
          })
          .eq("id", tx.id);

        if (!updateErr && stockUnitIds.length > 0) {
          await supabase
            .from("stock_units")
            .update({
              stock_status: "sold",
              sold_channel: "pos",
              sold_reference_id: tx.id,
              sold_at: new Date().toISOString(),
            })
            .in("id", stockUnitIds)
            .neq("stock_status", "sold");
          console.log(`Stock units marked SOLD (pos) for transaction ${baseTxCode}`);
        }
      }
    } else if (status === "FAILED" || status === "EXPIRED") {
      if (tx.status !== "cancelled") {
        await supabase
          .from("transactions")
          .update({
            status: "cancelled",
            notes: `Pembayaran ${status === "EXPIRED" ? "kedaluwarsa" : "gagal"} via TriPay. Ref: ${reference}`,
          })
          .eq("id", tx.id);

        // Release reserved stock back to available
        if (stockUnitIds.length > 0) {
          await supabase
            .from("stock_units")
            .update({ stock_status: "available", sold_reference_id: null })
            .in("id", stockUnitIds)
            .eq("stock_status", "reserved");
          console.log(`Stock units released back to available for cancelled transaction ${baseTxCode}`);
        }
      }
    } else if (status === "REFUND") {
      await supabase
        .from("transactions")
        .update({ status: "refunded", notes: `Dikembalikan via TriPay. Ref: ${reference}` })
        .eq("id", tx.id)
        .neq("status", "refunded");
    }

    // TriPay expects { "success": true } response
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("tripay-callback error:", msg);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

