import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RAJAONGKIR_BASE = "https://rajaongkir.komerce.id/api/v1";

/** Fetch all active API keys from DB, ordered by priority */
async function getApiKeys(): Promise<{ id: string; api_key: string; priority: number }[]> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);
  const { data, error } = await sb
    .from("rajaongkir_api_keys")
    .select("id, api_key, priority")
    .eq("is_active", true)
    .order("priority", { ascending: true });
  if (error) {
    console.error("Failed to fetch API keys from DB:", error.message);
    return [];
  }
  return data ?? [];
}

/** Mark a key as rate-limited in DB */
async function markRateLimited(keyId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);
  await sb
    .from("rajaongkir_api_keys")
    .update({ last_rate_limited_at: new Date().toISOString() })
    .eq("id", keyId);
}

/** Execute a fetch with automatic 429 fallback across multiple API keys */
async function fetchWithFallback(
  buildRequest: (apiKey: string) => { url: string; init: RequestInit },
): Promise<Response> {
  const keys = await getApiKeys();

  // Fallback to env secret if no DB keys configured
  if (keys.length === 0) {
    const envKey = Deno.env.get("RAJAONGKIR_API_KEY");
    if (!envKey) {
      return new Response(
        JSON.stringify({ success: false, error: "No RajaOngkir API key configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    keys.push({ id: "env", api_key: envKey, priority: 0 });
  }

  for (const key of keys) {
    const { url, init } = buildRequest(key.api_key);
    try {
      const res = await fetch(url, init);
      if (res.status === 429) {
        console.warn(`API key priority ${key.priority} (${key.id}) hit 429 rate limit, trying next...`);
        if (key.id !== "env") await markRateLimited(key.id);
        continue;
      }
      return res;
    } catch (err) {
      console.error(`Fetch error with key ${key.priority}:`, err);
      continue;
    }
  }

  return new Response(
    JSON.stringify({ success: false, error: "All API keys exhausted (rate limited)" }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Action: search-destination
    if (action === "search-destination") {
      const keyword = url.searchParams.get("keyword") || "";
      const res = await fetchWithFallback((apiKey) => ({
        url: `${RAJAONGKIR_BASE}/destination/domestic-destination?search=${encodeURIComponent(keyword)}&limit=10&offset=0`,
        init: { headers: { key: apiKey } },
      }));
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.error("RajaOngkir search response not JSON:", text.substring(0, 500));
        return new Response(JSON.stringify({ success: false, error: "Invalid response from RajaOngkir", raw: text.substring(0, 200) }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: cost
    if (action === "cost" && req.method === "POST") {
      const body = await req.json();
      const { origin, destination, weight, courier, price } = body;

      if (!origin || !destination || !weight || !courier) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing required fields: origin, destination, weight, courier" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const res = await fetchWithFallback((apiKey) => {
        const formData = new URLSearchParams();
        formData.append("origin", String(origin));
        formData.append("destination", String(destination));
        formData.append("weight", String(weight));
        formData.append("courier", courier);
        if (price) formData.append("price", price);

        return {
          url: `${RAJAONGKIR_BASE}/calculate/domestic-cost`,
          init: {
            method: "POST",
            headers: {
              key: apiKey,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: formData.toString(),
          },
        };
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: couriers
    if (action === "couriers") {
      const couriers = [
        { code: "jne", name: "JNE" },
        { code: "jnt", name: "J&T Express" },
        { code: "sicepat", name: "SiCepat" },
        { code: "ide", name: "IDExpress" },
        { code: "sap", name: "SAP Express" },
        { code: "ninja", name: "Ninja Xpress" },
        { code: "lion", name: "Lion Parcel" },
        { code: "pos", name: "POS Indonesia" },
        { code: "tiki", name: "TIKI" },
        { code: "wahana", name: "Wahana Express" },
        { code: "sentral", name: "Sentral Cargo" },
        { code: "rex", name: "Royal Express Asia" },
      ];
      return new Response(JSON.stringify({ success: true, data: couriers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ success: false, error: "Invalid action. Use: search-destination, cost, couriers" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("rajaongkir-proxy error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
