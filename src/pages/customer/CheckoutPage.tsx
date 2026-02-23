import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, ArrowRight, ShoppingBag, Tag, User, MapPin, Truck,
  CreditCard, CheckCircle2, AlertCircle, Shield, LogIn, UserPlus,
  Loader2, Package, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { supabaseCustomer } from "@/integrations/supabase/customer-client";
import { getCart, clearCart, type CartItem } from "@/pages/customer/CartPage";
import { useToast } from "@/hooks/use-toast";
import { useProvinces, useRegencies, useDistricts, useVillages } from "@/hooks/use-wilayah";
import { z } from "zod";

const USD_RATE = 15500;

function useFormatPrice() {
  const { currency } = useLocale();
  return (n: number | null | undefined) => {
    if (!n && n !== 0) return "—";
    if (currency === "USD") {
      return "$" + (n / USD_RATE).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return "Rp" + n.toLocaleString("id-ID");
  };
}

const WARRANTY_SHORT: Record<string, string> = {
  resmi_bc: "Resmi BC", ibox: "Resmi iBox", inter: "Inter", whitelist: "Whitelist", digimap: "Digimap",
};

const STEPS = [
  { key: "info", label: "Informasi Pemesanan", icon: User },
  { key: "shipping", label: "Pengiriman", icon: Truck },
  { key: "payment", label: "Pembayaran", icon: CreditCard },
] as const;

type Step = typeof STEPS[number]["key"];

// ── Validation schemas ────────────────────────────────────────────────────────
const customerInfoSchema = z.object({
  fullName: z.string().min(2, "Nama minimal 2 karakter").max(100),
  email: z.string().email("Email tidak valid"),
  phone: z.string().min(10, "Nomor telepon minimal 10 digit").max(15),
});

// ── Main Checkout Page ────────────────────────────────────────────────────────
export default function CheckoutPage() {
  const navigate = useNavigate();
  const formatPrice = useFormatPrice();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useCustomerAuth();
  const [items] = useState<CartItem[]>(() => getCart());
  const [step, setStep] = useState<Step>("info");
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{ code: string; amount: number } | null>(null);
  const [discountError, setDiscountError] = useState("");

  // Restore cached checkout data from localStorage
  const cached = useMemo(() => {
    try {
      const raw = localStorage.getItem("checkout_cache");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  // Step 1: Info
  const [authMode, setAuthMode] = useState<"login" | "register" | null>(null);
  const [fullName, setFullName] = useState(cached?.fullName ?? "");
  const [email, setEmail] = useState(cached?.email ?? "");
  const [phone, setPhone] = useState(cached?.phone ?? "");
  const [infoErrors, setInfoErrors] = useState<Record<string, string>>({});

  // Address
  const [province, setProvince] = useState<string | null>(cached?.province ?? null);
  const [provinceName, setProvinceName] = useState(cached?.provinceName ?? "");
  const [regency, setRegency] = useState<string | null>(cached?.regency ?? null);
  const [regencyName, setRegencyName] = useState(cached?.regencyName ?? "");
  const [district, setDistrict] = useState<string | null>(cached?.district ?? null);
  const [districtName, setDistrictName] = useState(cached?.districtName ?? "");
  const [village, setVillage] = useState<string | null>(cached?.village ?? null);
  const [villageName, setVillageName] = useState(cached?.villageName ?? "");
  const [fullAddress, setFullAddress] = useState(cached?.fullAddress ?? "");
  const [postalCode, setPostalCode] = useState(cached?.postalCode ?? "");

  // Step 2: Shipping
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>(() => {
    try {
      const raw = localStorage.getItem("checkout_shipping_cache");
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Only restore if address hasn't changed
      if (parsed.addressKey === `${cached?.district ?? ""}|${cached?.regency ?? ""}`) {
        return parsed.options ?? [];
      }
      return [];
    } catch { return []; }
  });
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [shippingLoading, setShippingLoading] = useState(false);

  // Step 3: Payment
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannel[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Wilayah hooks
  const { data: provinces, loading: provLoading } = useProvinces();
  const { data: regencies, loading: regLoading } = useRegencies(province);
  const { data: districts, loading: distLoading } = useDistricts(regency);
  const { data: villages, loading: vilLoading } = useVillages(district);

  // Save checkout form data to localStorage whenever it changes
  useEffect(() => {
    const data = {
      fullName, email, phone, province, provinceName, regency, regencyName,
      district, districtName, village, villageName, fullAddress, postalCode,
    };
    localStorage.setItem("checkout_cache", JSON.stringify(data));
  }, [fullName, email, phone, province, provinceName, regency, regencyName, district, districtName, village, villageName, fullAddress, postalCode]);

  // Auto-fill user data AND saved address
  useEffect(() => {
    if (user && !authLoading) {
      setEmail(user.email || "");
      setFullName(user.user_metadata?.full_name || "");
      setAuthMode(null);

      // Load saved address
      supabaseCustomer
        .from("customer_addresses")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .limit(1)
        .then(({ data: addresses }) => {
          if (addresses && addresses.length > 0) {
            const addr = addresses[0] as any;
            setFullName(addr.full_name || user.user_metadata?.full_name || "");
            setPhone(addr.phone || "");
            setProvince(addr.province_code || null);
            setProvinceName(addr.province_name || "");
            setRegency(addr.regency_code || null);
            setRegencyName(addr.regency_name || "");
            setDistrict(addr.district_code || null);
            setDistrictName(addr.district_name || "");
            setVillage(addr.village_code || null);
            setVillageName(addr.village_name || "");
            setFullAddress(addr.full_address || "");
            setPostalCode(addr.postal_code || "");
          }
        });
    }
  }, [user, authLoading]);

  // Redirect if cart empty
  useEffect(() => {
    if (items.length === 0) navigate("/keranjang", { replace: true });
  }, [items, navigate]);

  // Fetch payment channels via edge function proxy
  useEffect(() => {
    async function fetchChannels() {
      setPaymentLoading(true);
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(`${supabaseUrl}/functions/v1/tripay-channels`, {
          headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
        });
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          const mapped: PaymentChannel[] = json.data
            .filter((ch: any) => ch.active)
            .map((ch: any) => ({
              code: ch.code,
              name: ch.name,
              group: ch.group,
              icon: ch.icon_url ? "" : (ch.group?.includes("Virtual") ? "🏦" : "📱"),
              iconUrl: ch.icon_url || "",
              fee_flat: ch.fee_customer?.flat ?? 0,
              fee_percent: ch.fee_customer?.percent ?? 0,
            }));
          setPaymentChannels(mapped);
        } else {
          // Fallback hardcoded
          setPaymentChannels([
            { code: "BCAVA", name: "BCA Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
            { code: "BNIVA", name: "BNI Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
            { code: "BRIVA", name: "BRI Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
            { code: "MANDIRIVA", name: "Mandiri Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
            { code: "QRIS", name: "QRIS", group: "E-Wallet", icon: "📱", fee_flat: 0, fee_percent: 0.7 },
            { code: "QRISC", name: "QRIS (Customizable)", group: "E-Wallet", icon: "📱", fee_flat: 0, fee_percent: 0.7 },
          ]);
        }
      } catch {
        setPaymentChannels([
          { code: "BCAVA", name: "BCA Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
          { code: "BNIVA", name: "BNI Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
          { code: "BRIVA", name: "BRI Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
          { code: "MANDIRIVA", name: "Mandiri Virtual Account", group: "Virtual Account", icon: "🏦", fee_flat: 4000, fee_percent: 0 },
          { code: "QRIS", name: "QRIS", group: "E-Wallet", icon: "📱", fee_flat: 0, fee_percent: 0.7 },
          { code: "QRISC", name: "QRIS (Customizable)", group: "E-Wallet", icon: "📱", fee_flat: 0, fee_percent: 0.7 },
        ]);
      } finally {
        setPaymentLoading(false);
      }
    }
    fetchChannels();
  }, []);

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + i.sellingPrice, 0);
  const discount = discountApplied?.amount ?? 0;
  const shippingCost = selectedShipping?.cost ?? 0;
  // Check if any item has free shipping
  const hasFreeShipping = false; // Would need catalog data for this
  const shippingDiscount = 0; // From discount code
  const finalShippingCost = Math.max(0, shippingCost - shippingDiscount);
  const total = Math.max(0, subtotal - discount + finalShippingCost);

  const stepIndex = STEPS.findIndex(s => s.key === step);
  const progressValue = ((stepIndex + 1) / STEPS.length) * 100;

  // ── Step 1 validation ───────────────────────────────────────────────────────
  function validateInfo(): boolean {
    const result = customerInfoSchema.safeParse({ fullName, email, phone });
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach(i => { errs[i.path[0] as string] = i.message; });
      setInfoErrors(errs);
      return false;
    }
    if (!province || !regency || !district || !fullAddress.trim()) {
      setInfoErrors({ address: "Lengkapi semua data alamat pengiriman" });
      return false;
    }
    setInfoErrors({});
    return true;
  }

  async function handleNextFromInfo() {
    if (!user && !authMode) {
      toast({ title: "Pilih metode", description: "Pilih apakah sudah punya akun atau belum", variant: "destructive" });
      return;
    }
    if (!user) {
      toast({ title: "Login diperlukan", description: "Silakan login atau daftar terlebih dahulu", variant: "destructive" });
      return;
    }
    if (!validateInfo()) return;

    // Save/update customer address
    try {
      const { data: existing } = await supabaseCustomer
        .from("customer_addresses")
        .select("id")
        .eq("user_id", user.id)
        .eq("is_default", true)
        .limit(1);

      const addressData = {
        user_id: user.id,
        full_name: fullName,
        phone,
        province_code: province,
        province_name: provinceName,
        regency_code: regency,
        regency_name: regencyName,
        district_code: district,
        district_name: districtName,
        village_code: village,
        village_name: villageName,
        full_address: fullAddress,
        postal_code: postalCode,
        is_default: true,
      };

      if (existing && existing.length > 0) {
        await supabaseCustomer.from("customer_addresses").update(addressData as any).eq("id", (existing[0] as any).id);
      } else {
        await supabaseCustomer.from("customer_addresses").insert(addressData as any);
      }
    } catch (e) {
      console.error("Failed to save address:", e);
    }

    // Use cached shipping if address hasn't changed
    const cacheKey = `${district}|${regency}`;
    try {
      const raw = localStorage.getItem("checkout_shipping_cache");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.addressKey === cacheKey && Array.isArray(parsed.options) && parsed.options.length > 0) {
          setShippingOptions(parsed.options);
          setStep("shipping");
          return;
        }
      }
    } catch { /* ignore */ }

    fetchShippingOptions();
    setStep("shipping");
  }

  // ── Step 2: Fetch shipping ──────────────────────────────────────────────────
  async function resolveRajaOngkirId(keyword: string, supabaseUrl: string, supabaseKey: string): Promise<string | null> {
    // Strip common prefixes for better matching
    const cleanKeyword = keyword.replace(/^(Kota|Kabupaten|Kab\.?)\s+/i, "").trim();
    const attempts = [cleanKeyword, keyword];
    for (const kw of attempts) {
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/rajaongkir-proxy?action=search-destination&keyword=${encodeURIComponent(kw)}`, {
          headers: { Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
        });
        const json = await res.json();
        if (json.data?.length > 0) {
          return json.data[0]?.id?.toString() || null;
        }
      } catch { /* ignore */ }
    }
    return null;
  }

  async function fetchShippingOptions() {
    setShippingLoading(true);
    setShippingOptions([]);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      
      // Determine origin from the first item's branch
      let originId: string | null = null;
      const branchId = items[0]?.branchId;
      if (branchId) {
        const { data: branchData } = await supabaseCustomer.from("branches").select("city, district").eq("id", branchId).single();
        if (branchData?.city) {
          originId = await resolveRajaOngkirId(branchData.city, supabaseUrl, supabaseKey);
        }
        if (!originId && branchData?.district) {
          originId = await resolveRajaOngkirId(branchData.district, supabaseUrl, supabaseKey);
        }
      }
      if (!originId) originId = "3578"; // fallback Surabaya

      // Resolve destination - use village name first (most specific), then district, then regency
      let destinationId: string | null = null;
      if (villageName && districtName) {
        destinationId = await resolveRajaOngkirId(`${villageName} ${districtName}`, supabaseUrl, supabaseKey);
      }
      if (!destinationId && districtName && regencyName) {
        const cleanRegency = regencyName.replace(/^(Kota|Kabupaten|Kab\.?)\s+/i, "").trim();
        destinationId = await resolveRajaOngkirId(`${districtName} ${cleanRegency}`, supabaseUrl, supabaseKey);
      }
      if (!destinationId && districtName) {
        destinationId = await resolveRajaOngkirId(districtName, supabaseUrl, supabaseKey);
      }
      if (!destinationId && regencyName) {
        destinationId = await resolveRajaOngkirId(regencyName, supabaseUrl, supabaseKey);
      }
      if (!destinationId) {
        console.error("Could not resolve destination for:", { villageName, districtName, regencyName });
        setShippingLoading(false);
        return;
      }

      // Fetch shipping from multiple couriers in parallel (individual calls for reliability)
      const courierList = ["jne", "jnt", "sicepat", "ninja", "lion", "pos", "tiki", "anteraja", "ide", "sap"];
      const allOptions: ShippingOption[] = [];

      const fetchCourier = async (courier: string) => {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/rajaongkir-proxy?action=cost`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
              apikey: supabaseKey,
            },
            body: JSON.stringify({
              origin: originId,
              destination: destinationId,
              weight: 500,
              courier,
            }),
          });
          const json = await res.json();
          if (json.data && Array.isArray(json.data)) {
            for (const item of json.data) {
              if (item.cost != null && item.cost > 0) {
                allOptions.push({
                  courier: item.code?.toUpperCase() || courier.toUpperCase(),
                  courierName: item.name || courier.toUpperCase(),
                  service: item.service || "",
                  description: item.description || "",
                  cost: item.cost,
                  etd: item.etd || "-",
                });
              }
            }
          }
        } catch { /* skip failed courier */ }
      };

      await Promise.all(courierList.map(fetchCourier));

      // Filter out expensive options (> 500k) and keep only 5 cheapest
      const MAX_COST = 500000;
      const filtered = allOptions
        .filter(o => o.cost <= MAX_COST)
        .sort((a, b) => a.cost - b.cost);

      // Deduplicate: keep cheapest per courier
      const seen = new Map<string, ShippingOption>();
      for (const opt of filtered) {
        const key = opt.courier;
        if (!seen.has(key) || seen.get(key)!.cost > opt.cost) {
          seen.set(key, opt);
        }
      }

      const deduped = Array.from(seen.values()).sort((a, b) => a.cost - b.cost).slice(0, 5);
      setShippingOptions(deduped);
      // Cache shipping options with address key
      localStorage.setItem("checkout_shipping_cache", JSON.stringify({
        addressKey: `${district}|${regency}`,
        options: deduped,
      }));
    } catch (err) {
      console.error("Failed to fetch shipping:", err);
    } finally {
      setShippingLoading(false);
    }
  }

  // ── Step 3: Create transaction ──────────────────────────────────────────────
  async function handleSubmitOrder() {
    if (!selectedPayment || !user) return;
    setSubmitting(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const session = (await supabaseCustomer.auth.getSession()).data.session;
      if (!session) throw new Error("Not authenticated");

      // Use the branch from the cart items (catalog product's branch)
      const branchId = items[0]?.branchId;
      if (!branchId) {
        // Fallback: get first active branch
        const { data: branchesData } = await supabaseCustomer.from("branches").select("id").eq("is_active", true).limit(1);
        if (!branchesData?.[0]?.id) throw new Error("No active branch found");
        var finalBranchId = branchesData[0].id;
      } else {
        var finalBranchId = branchId;
      }

      // Generate transaction code
      const txCode = `WEB-${Date.now().toString(36).toUpperCase()}`;

      // Create transaction
      const { data: tx, error: txError } = await supabaseCustomer.from("transactions").insert({
        branch_id: finalBranchId,
        transaction_code: txCode,
        customer_name: fullName,
        customer_email: email,
        customer_phone: phone,
        customer_user_id: user.id,
        subtotal,
        discount_amount: discount,
        discount_code: discountApplied?.code || null,
        shipping_cost: shippingCost,
        shipping_courier: selectedShipping?.courier || null,
        shipping_service: selectedShipping?.service || null,
        shipping_etd: selectedShipping?.etd || null,
        shipping_discount: shippingDiscount,
        shipping_address: fullAddress,
        shipping_city: regencyName,
        shipping_province: provinceName,
        shipping_postal_code: postalCode,
        shipping_district: districtName,
        shipping_village: villageName,
        total,
        status: "pending",
        payment_method_name: selectedPayment,
      } as any).select("id, transaction_code").single();

      if (txError) throw txError;

      // Insert transaction items
      for (const item of items) {
        await supabaseCustomer.from("transaction_items").insert({
          transaction_id: tx.id,
          stock_unit_id: item.unitId,
          product_label: `${item.productName} ${item.color} ${item.storageGb}GB`,
          imei: item.imeiCensored,
          selling_price: item.sellingPrice,
        } as any);
      }

      // If total > 10M, skip TriPay — redirect to transaction detail for split payment
      if (total > 10_000_000) {
        clearCart();
        localStorage.removeItem("checkout_cache");
        localStorage.removeItem("checkout_shipping_cache");
        toast({ title: "Pesanan dibuat!", description: "Total transaksi melebihi Rp10.000.000. Silakan hubungi admin untuk pembayaran bertahap." });
        navigate(`/riwayat/${tx.id}`);
        return;
      }

      // Create TriPay transaction
      const tripayRes = await fetch(`${supabaseUrl}/functions/v1/tripay-create-transaction`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          transactionCode: txCode,
          total,
          customerName: fullName,
          customerEmail: email,
          customerPhone: phone,
          paymentMethod: selectedPayment,
          items: items.map(i => ({
            label: `${i.productName} ${i.color} ${i.storageGb}GB`,
            price: i.sellingPrice,
          })),
        }),
      });
      const tripayData = await tripayRes.json();

      if (!tripayData.success) {
        throw new Error(tripayData.error || "Payment creation failed");
      }

      // Redirect to payment page (TriPay checkout URL)
      const paymentUrl = tripayData.data?.[0]?.checkout_url || tripayData.data?.checkout_url;
      if (paymentUrl) {
        window.location.href = paymentUrl;
      } else {
        navigate("/katalog");
      }
    } catch (err: any) {
      console.error("Checkout error:", err);
      toast({ title: "Gagal membuat pesanan", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  function handleApplyDiscount() {
    setDiscountError("");
    if (!discountCode.trim()) return;
    setDiscountError("Kode diskon tidak valid atau sudah kedaluwarsa.");
  }

  if (items.length === 0) return null;

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />
      <div className="pt-4">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => step === "info" ? navigate("/keranjang") : setStep(step === "payment" ? "shipping" : "info")} className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Checkout</h1>
              <p className="text-xs text-muted-foreground">{items.length} item</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
            {/* LEFT — Steps */}
            <div className="space-y-6">
              {/* Progress bar */}
              <div className="space-y-3">
                <Progress value={progressValue} className="h-2" />
                <div className="flex justify-between">
                  {STEPS.map((s, i) => (
                    <button
                      key={s.key}
                      onClick={() => {
                        if (i < stepIndex) setStep(s.key);
                      }}
                      disabled={i > stepIndex}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-medium transition-colors",
                        i <= stepIndex ? "text-foreground" : "text-muted-foreground/50",
                        i < stepIndex && "cursor-pointer hover:text-foreground/80",
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                        i < stepIndex ? "bg-foreground text-background" :
                        i === stepIndex ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                      )}>
                        {i < stepIndex ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                      </div>
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* STEP 1: Info */}
              {step === "info" && (
                <div className="space-y-6">
                  {/* Auth toggle */}
                  {!user && !authLoading && (
                    <div className="space-y-4">
                      <p className="text-sm font-semibold text-foreground">Apakah Anda sudah punya akun?</p>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setAuthMode("login")}
                          className={cn(
                            "p-4 rounded-xl border-2 text-center transition-all",
                            authMode === "login"
                              ? "border-foreground bg-foreground/5"
                              : "border-border hover:border-foreground/40"
                          )}
                        >
                          <LogIn className="w-5 h-5 mx-auto mb-2 text-foreground" />
                          <p className="text-sm font-semibold text-foreground">Sudah punya akun</p>
                          <p className="text-xs text-muted-foreground mt-1">Login ke akun Anda</p>
                        </button>
                        <button
                          onClick={() => setAuthMode("register")}
                          className={cn(
                            "p-4 rounded-xl border-2 text-center transition-all",
                            authMode === "register"
                              ? "border-foreground bg-foreground/5"
                              : "border-border hover:border-foreground/40"
                          )}
                        >
                          <UserPlus className="w-5 h-5 mx-auto mb-2 text-foreground" />
                          <p className="text-sm font-semibold text-foreground">Belum punya akun</p>
                          <p className="text-xs text-muted-foreground mt-1">Daftar sekarang</p>
                        </button>
                      </div>

                      {authMode === "login" && (
                        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                          <p className="text-sm font-medium text-foreground">Login untuk melanjutkan</p>
                          <p className="text-xs text-muted-foreground">Data keranjang Anda tetap tersimpan.</p>
                          <Button onClick={() => navigate("/login?redirect=/checkout")} className="w-full gap-2">
                            <LogIn className="w-4 h-4" /> Masuk ke Akun
                          </Button>
                        </div>
                      )}

                      {authMode === "register" && (
                        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                          <p className="text-sm font-medium text-foreground">Buat akun baru</p>
                          <p className="text-xs text-muted-foreground">Daftar untuk melanjutkan checkout. Data keranjang tetap aman.</p>
                          <Button onClick={() => navigate("/register?redirect=/checkout")} className="w-full gap-2">
                            <UserPlus className="w-4 h-4" /> Daftar Sekarang
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* User info form (shown when logged in) */}
                  {user && (
                    <div className="space-y-6">
                      <div className="p-3 rounded-xl border border-border bg-card flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center">
                          <User className="w-5 h-5 text-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{fullName || user.email}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                        <CheckCircle2 className="w-4 h-4 text-green-600 ml-auto" />
                      </div>

                      {/* Contact info */}
                      <div className="space-y-4">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <User className="w-4 h-4" /> Data Pemesan
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Nama Lengkap *</Label>
                            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nama lengkap" className="h-10" />
                            {infoErrors.fullName && <p className="text-xs text-destructive">{infoErrors.fullName}</p>}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Email *</Label>
                            <Input value={email} readOnly className="h-10 bg-muted/50" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Nomor Telepon *</Label>
                          <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" className="h-10" />
                          {infoErrors.phone && <p className="text-xs text-destructive">{infoErrors.phone}</p>}
                        </div>
                      </div>

                      {/* Address */}
                      <div className="space-y-4">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <MapPin className="w-4 h-4" /> Alamat Pengiriman
                        </p>
                        {infoErrors.address && <p className="text-xs text-destructive">{infoErrors.address}</p>}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Province */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Provinsi *</Label>
                            <div className="relative">
                              <select
                                value={province || ""}
                                onChange={e => {
                                  const code = e.target.value;
                                  setProvince(code);
                                  setProvinceName(provinces.find(p => p.code === code)?.name || "");
                                  setRegency(null); setDistrict(null); setVillage(null);
                                }}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm appearance-none"
                              >
                                <option value="">Pilih provinsi</option>
                                {provinces.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>

                          {/* Regency */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Kota/Kabupaten *</Label>
                            <div className="relative">
                              <select
                                value={regency || ""}
                                onChange={e => {
                                  const code = e.target.value;
                                  setRegency(code);
                                  setRegencyName(regencies.find(r => r.code === code)?.name || "");
                                  setDistrict(null); setVillage(null);
                                }}
                                disabled={!province}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm appearance-none disabled:opacity-50"
                              >
                                <option value="">Pilih kota/kab</option>
                                {regencies.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>

                          {/* District */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Kecamatan *</Label>
                            <div className="relative">
                              <select
                                value={district || ""}
                                onChange={e => {
                                  const code = e.target.value;
                                  setDistrict(code);
                                  setDistrictName(districts.find(d => d.code === code)?.name || "");
                                  setVillage(null);
                                }}
                                disabled={!regency}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm appearance-none disabled:opacity-50"
                              >
                                <option value="">Pilih kecamatan</option>
                                {districts.map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>

                          {/* Village */}
                          <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Kelurahan</Label>
                            <div className="relative">
                              <select
                                value={village || ""}
                                onChange={e => {
                                  const code = e.target.value;
                                  setVillage(code);
                                  setVillageName(villages.find(v => v.code === code)?.name || "");
                                }}
                                disabled={!district}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm appearance-none disabled:opacity-50"
                              >
                                <option value="">Pilih kelurahan</option>
                                {villages.map(v => <option key={v.code} value={v.code}>{v.name}</option>)}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Alamat Lengkap *</Label>
                          <Input value={fullAddress} onChange={e => setFullAddress(e.target.value)} placeholder="Jl. Contoh No. 123, RT/RW..." className="h-10" />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">Kode Pos</Label>
                          <Input value={postalCode} onChange={e => setPostalCode(e.target.value)} placeholder="60xxx" className="h-10 w-32" />
                        </div>
                      </div>

                      <Button onClick={handleNextFromInfo} className="w-full h-11 gap-2 font-semibold">
                        Lanjut ke Pengiriman <ArrowRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Shipping */}
              {step === "shipping" && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Truck className="w-4 h-4" /> Pilih Layanan Pengiriman
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pengiriman ke: {districtName && `${districtName}, `}{regencyName && `${regencyName}, `}{provinceName}
                  </p>

                  {shippingLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Memuat opsi pengiriman...</span>
                    </div>
                  ) : shippingOptions.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Tidak ada opsi pengiriman tersedia</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={fetchShippingOptions}>Coba Lagi</Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {shippingOptions.map((opt, i) => (
                        <button
                          key={`${opt.courier}-${opt.service}-${i}`}
                          onClick={() => setSelectedShipping(opt)}
                          className={cn(
                            "w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4",
                            selectedShipping === opt
                              ? "border-foreground bg-foreground/5"
                              : "border-border hover:border-foreground/40"
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              {opt.courierName} — {opt.service}
                            </p>
                            {opt.description && <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>}
                            <p className="text-xs text-muted-foreground mt-1">Estimasi: {opt.etd} hari</p>
                          </div>
                          <div className="text-right shrink-0">
                            {hasFreeShipping ? (
                              <div>
                                <p className="text-xs text-muted-foreground line-through">{formatPrice(opt.cost)}</p>
                                <p className="text-sm font-bold text-green-600">Gratis</p>
                              </div>
                            ) : (
                              <p className="text-sm font-bold text-foreground">{formatPrice(opt.cost)}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  <Button
                    onClick={() => {
                      if (!selectedShipping) {
                        toast({ title: "Pilih pengiriman", description: "Pilih layanan pengiriman terlebih dahulu", variant: "destructive" });
                        return;
                      }
                      setStep("payment");
                    }}
                    disabled={!selectedShipping}
                    className="w-full h-11 gap-2 font-semibold"
                  >
                    Lanjut ke Pembayaran <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* STEP 3: Payment */}
              {step === "payment" && (
                <div className="space-y-4">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Pilih Metode Pembayaran
                  </p>
                  <p className="text-xs text-muted-foreground">Pembayaran otomatis melalui TriPay</p>

                  {/* Group payment channels */}
                  {(() => {
                    const groups = new Map<string, PaymentChannel[]>();
                    paymentChannels.forEach(ch => {
                      const g = ch.group || "Lainnya";
                      if (!groups.has(g)) groups.set(g, []);
                      groups.get(g)!.push(ch);
                    });

                    return Array.from(groups.entries()).map(([group, channels]) => (
                      <div key={group} className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</p>
                        {channels.map(ch => (
                          <button
                            key={ch.code}
                            onClick={() => setSelectedPayment(ch.code)}
                            className={cn(
                              "w-full p-4 rounded-xl border-2 text-left transition-all flex items-center gap-3",
                              selectedPayment === ch.code
                                ? "border-foreground bg-foreground/5"
                                : "border-border hover:border-foreground/40"
                            )}
                          >
                            {ch.iconUrl ? <img src={ch.iconUrl} alt={ch.name} className="w-8 h-6 object-contain" /> : <span className="text-xl">{ch.icon}</span>}
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-foreground">{ch.name}</p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                Biaya admin: {ch.fee_flat > 0 && ch.fee_percent > 0
                                  ? `${formatPrice(ch.fee_flat)} + ${ch.fee_percent}%`
                                  : ch.fee_flat > 0
                                    ? formatPrice(ch.fee_flat)
                                    : ch.fee_percent > 0
                                      ? `${ch.fee_percent}%`
                                      : "Gratis"}
                              </p>
                            </div>
                            {selectedPayment === ch.code && <CheckCircle2 className="w-4 h-4 text-foreground" />}
                          </button>
                        ))}
                      </div>
                    ));
                  })()}

                </div>
              )}
            </div>

            {/* RIGHT — Order Summary */}
            <div className="lg:self-start">
              <div className="bg-card border border-border rounded-xl p-5 space-y-4 sticky top-20">
                <p className="text-sm font-semibold text-foreground">Ringkasan Pesanan</p>

                {/* Items */}
                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {items.map(item => (
                    <div key={item.unitId} className="flex gap-3">
                      <div className="w-12 h-12 rounded-lg bg-muted/40 overflow-hidden shrink-0">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ShoppingBag className="w-4 h-4 text-muted-foreground/30" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground line-clamp-1">{item.productName}</p>
                        <p className="text-[10px] text-muted-foreground">{item.color} · {item.storageGb}GB · {WARRANTY_SHORT[item.warrantyType] ?? item.warrantyType}</p>
                        <p className="text-xs font-bold text-foreground mt-0.5">{formatPrice(item.sellingPrice)}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Discount code */}
                <div className="space-y-2 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">Kode Diskon / Promo</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        value={discountCode}
                        onChange={e => { setDiscountCode(e.target.value.toUpperCase()); setDiscountError(""); }}
                        placeholder="Kode promo"
                        className="pl-9 h-9 text-sm uppercase"
                      />
                    </div>
                    <Button variant="outline" size="sm" className="h-9 text-xs" onClick={handleApplyDiscount}>
                      Pakai
                    </Button>
                  </div>
                  {discountError && <p className="text-[11px] text-destructive">{discountError}</p>}
                  {discountApplied && (
                    <div className="flex items-center justify-between text-xs p-2 rounded-lg bg-green-50 border border-green-200">
                      <span className="text-green-700 font-medium">✓ {discountApplied.code}</span>
                      <span className="text-green-700 font-bold">-{formatPrice(discountApplied.amount)}</span>
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal ({items.length} item)</span>
                    <span className="font-medium text-foreground">{formatPrice(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-600">Diskon</span>
                      <span className="font-medium text-green-600">-{formatPrice(discount)}</span>
                    </div>
                  )}
                  {selectedShipping && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Ongkir ({selectedShipping.courier})</span>
                      {hasFreeShipping ? (
                        <div className="text-right">
                          <span className="text-xs text-muted-foreground line-through mr-1">{formatPrice(shippingCost)}</span>
                          <span className="font-medium text-green-600">Gratis</span>
                        </div>
                      ) : (
                        <span className="font-medium text-foreground">{formatPrice(finalShippingCost)}</span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-border">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">{formatPrice(total)}</span>
                  </div>
                </div>

                {/* Pay button — only on payment step */}
                {step === "payment" && (
                  <Button
                    onClick={handleSubmitOrder}
                    disabled={!selectedPayment || submitting}
                    className="w-full h-12 gap-2 font-semibold text-base"
                  >
                    {submitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>Bayar Pesanan <ArrowRight className="w-4 h-4" /></>
                    )}
                  </Button>
                )}

                {/* Security badge */}
                <div className="flex items-center gap-2 pt-1">
                  <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-[10px] text-muted-foreground">Pembayaran aman diproses oleh TriPay</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ShippingOption {
  courier: string;
  courierName: string;
  service: string;
  description: string;
  cost: number;
  etd: string;
}

interface PaymentChannel {
  code: string;
  name: string;
  group: string;
  icon: string;
  iconUrl?: string;
  fee_flat: number;
  fee_percent: number;
}
