import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// TriPay Sandbox base URL
const TRIPAY_BASE = "https://tripay.co.id/api-sandbox";

// Max amount per TriPay VA transaction (10 jt)
const MAX_PER_TX = 10_000_000;

function createSignature(
  merchantCode: string,
  merchantRef: string,
  amount: number,
  privateKey: string,
): string {
  // HMAC-SHA256 of merchantCode + merchantRef + amount
  const encoder = new TextEncoder();
  const keyData = encoder.encode(privateKey);
  const messageData = encoder.encode(`${merchantCode}${merchantRef}${amount}`);

  // Use crypto subtle
  return crypto.subtle
    .importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((key) => crypto.subtle.sign("HMAC", key, messageData))
    .then((sig) =>
      Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    ) as unknown as string;
}

async function generateHmac(
  privateKey: string,
  merchantCode: string,
  merchantRef: string,
  amount: number,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(privateKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${merchantCode}${merchantRef}${amount}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createTripayTransaction(
  apiKey: string,
  privateKey: string,
  merchantCode: string,
  payload: {
    method: string; // e.g. "BCAVA"
    merchantRef: string;
    amount: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    orderItems: Array<{ name: string; price: number; quantity: number }>;
    callbackUrl?: string;
    returnUrl?: string;
    expiredTime?: number; // unix timestamp
  },
) {
  const signature = await generateHmac(
    privateKey,
    merchantCode,
    payload.merchantRef,
    payload.amount,
  );

  const body = {
    method: payload.method,
    merchant_ref: payload.merchantRef,
    amount: payload.amount,
    customer_name: payload.customerName,
    customer_email: payload.customerEmail,
    customer_phone: payload.customerPhone || "08000000000",
    order_items: payload.orderItems,
    callback_url: payload.callbackUrl ?? `${Deno.env.get("SUPABASE_URL")}/functions/v1/tripay-callback`,
    return_url: payload.returnUrl ?? "",
    expired_time: payload.expiredTime ?? Math.floor(Date.now() / 1000) + 3 * 60 * 60,
    signature,
  };

  const res = await fetch(`${TRIPAY_BASE}/transaction/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!json.success) {
    throw new Error(`TriPay error: ${json.message ?? JSON.stringify(json)}`);
  }
  return json.data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const TRIPAY_API_KEY = Deno.env.get("TRIPAY_API_KEY");
    const TRIPAY_PRIVATE_KEY = Deno.env.get("TRIPAY_PRIVATE_KEY");
    const TRIPAY_MERCHANT_CODE = Deno.env.get("TRIPAY_MERCHANT_CODE");

    if (!TRIPAY_API_KEY || !TRIPAY_PRIVATE_KEY || !TRIPAY_MERCHANT_CODE) {
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

    const body = await req.json();
    const {
      transactionCode,
      total,
      customerName,
      customerEmail,
      customerPhone,
      items, // Array<{label, price}>
      paymentMethod, // e.g. "BCAVA"
    } = body;

    if (!transactionCode || !total || !items?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const orderItems = items.map((i: { label: string; price: number }) => ({
      name: i.label,
      price: i.price,
      quantity: 1,
    }));

    const method = paymentMethod ?? "BCAVA";

    const results = [];

    // ── Split if > 10jt ──────────────────────────────────────────────────────
    // TriPay strictly validates: sum(order_items[].price * qty) MUST equal amount.
    // So for each split we send a single order_item whose price equals that split's amount.
    if (total > MAX_PER_TX) {
      const splits: number[] = [];
      let remaining = total;
      while (remaining > 0) {
        const chunk = Math.min(remaining, MAX_PER_TX);
        splits.push(chunk);
        remaining -= chunk;
      }

      const txPromises = splits.map((chunk, idx) =>
        createTripayTransaction(TRIPAY_API_KEY, TRIPAY_PRIVATE_KEY, TRIPAY_MERCHANT_CODE, {
          method,
          merchantRef: `${transactionCode}-${idx + 1}`,
          amount: chunk,
          customerName: customerName ?? "Customer",
          customerEmail: customerEmail ?? "customer@example.com",
          customerPhone: customerPhone ?? "08000000000",
          // Each part gets exactly one item whose price == chunk so TriPay validation passes
          orderItems: [
            {
              name: idx === 0
                ? `Pembayaran ${idx + 1}/${splits.length} - ${transactionCode}`
                : `Sisa Pembayaran ${idx + 1}/${splits.length} - ${transactionCode}`,
              price: chunk,
              quantity: 1,
            },
          ],
        })
      );

      const txResults = await Promise.all(txPromises);
      results.push(...txResults);
    } else {
      // Single payment — orderItems total must equal amount exactly.
      // Recalculate from items to avoid floating-point drift.
      const itemsTotal = orderItems.reduce(
        (sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity,
        0,
      );

      // If there's any mismatch (e.g. discount applied), adjust with a discount/rounding item
      let finalOrderItems = orderItems;
      if (itemsTotal !== total) {
        const diff = total - itemsTotal;
        finalOrderItems = [
          ...orderItems,
          {
            name: diff < 0 ? "Diskon" : "Penyesuaian Harga",
            price: diff,
            quantity: 1,
          },
        ];
      }

      const tx = await createTripayTransaction(TRIPAY_API_KEY, TRIPAY_PRIVATE_KEY, TRIPAY_MERCHANT_CODE, {
        method,
        merchantRef: transactionCode,
        amount: total,
        customerName: customerName ?? "Customer",
        customerEmail: customerEmail ?? "customer@example.com",
        customerPhone: customerPhone ?? "08000000000",
        orderItems: finalOrderItems,
      });
      results.push(tx);
    }

    return new Response(
      JSON.stringify({ success: true, data: results, split: results.length > 1 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("tripay-create-transaction error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
