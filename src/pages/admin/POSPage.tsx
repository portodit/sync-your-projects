import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ShoppingCart, X, User, UserCheck, CreditCard, Tag,
  ChevronDown, CheckCircle2,
  Smartphone, AlertCircle, RefreshCw, ScanLine, Wallet,
  Building2, Banknote, Plus, ChevronRight, MapPin,
  Zap, Hand, ChevronUp, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { formatCurrency } from "@/lib/stock-units";
import { useIsMobile } from "@/hooks/use-mobile";

type CartTab = "keranjang" | "pelanggan" | "pembayaran";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MasterProduct {
  series: string;
  storage_gb: number;
  color: string;
  warranty_type: string;
  category: string;
}

interface StockUnit {
  id: string;
  imei: string;
  selling_price: number | null;
  condition_status: string;
  minus_severity: string | null;
  minus_description: string | null;
  stock_status: string;
  branch_id: string | null;
  master_products: MasterProduct | MasterProduct[] | null;
}

function getMasterProduct(unit: StockUnit): MasterProduct | null {
  if (!unit.master_products) return null;
  if (Array.isArray(unit.master_products)) return unit.master_products[0] ?? null;
  return unit.master_products;
}

interface CartItem {
  unit: StockUnit;
  label: string;
  expanded: boolean;
}

interface PaymentMethod {
  id: string;
  name: string;
  type: string;
  bank_name: string | null;
  account_number: string | null;
  account_name: string | null;
}

interface DiscountCode {
  id: string;
  code: string;
  discount_type: string;
  discount_percent: number | null;
  discount_amount: number | null;
  min_purchase_amount: number | null;
  applies_to_all: boolean;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

type CustomerType = "guest" | "registered";
type WarrantyFilter = "all" | "ibox" | "resmi_bc" | "inter" | "whitelist" | "digimap";
type ConditionFilter = "all" | "no_minus" | "minus_minor" | "minus_mayor";
type PaymentMode = "manual" | "online";

const WARRANTY_LABELS: Record<string, string> = {
  all: "Semua Tipe",
  resmi_bc: "Resmi BC",
  ibox: "Resmi iBox",
  inter: "Inter",
  whitelist: "Whitelist",
  digimap: "Digimap",
};

const CONDITION_LABELS: Record<ConditionFilter, string> = {
  all: "Semua Kondisi",
  no_minus: "No Minus",
  minus_minor: "Minus Minor",
  minus_mayor: "Minus Mayor",
};

const PAYMENT_TYPE_ICON: Record<string, React.ElementType> = {
  cash: Banknote,
  bank_transfer: Building2,
  ewallet: Wallet,
  other: CreditCard,
};

function productLabel(unit: StockUnit): string {
  const p = getMasterProduct(unit);
  if (!p) return `IMEI: ${unit.imei}`;
  return `${p.series} ${p.storage_gb}GB ${p.color}`;
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ unit, onAdd, inCart, compact }: {
  unit: StockUnit;
  onAdd: (unit: StockUnit) => void;
  inCart: boolean;
  compact?: boolean;
}) {
  const p = getMasterProduct(unit);
  const label = productLabel(unit);
  const warrantyLabel = WARRANTY_LABELS[p?.warranty_type ?? ""] ?? p?.warranty_type ?? "";
  const isNoMinus = unit.condition_status === "no_minus";

  const handleClick = () => onAdd(unit);

  return (
    <div
      className={cn(
        "bg-card border rounded-xl p-3 flex flex-col gap-2 transition-all duration-150 cursor-pointer group",
        inCart
          ? "border-primary/50 bg-primary/[0.04] shadow-sm"
          : "border-border hover:border-primary/30 hover:shadow-sm"
      )}
      onClick={handleClick}
    >
      {/* Phone icon area */}
      {!compact && (
        <div className="w-full aspect-[3/2] bg-muted/60 rounded-lg flex items-center justify-center relative overflow-hidden">
          <Smartphone className="w-10 h-10 text-muted-foreground/30" />
          {inCart && (
            <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-primary" />
            </div>
          )}
        </div>
      )}

      {/* Info */}
      <div className="space-y-1">
        {compact && inCart && (
          <div className="flex items-center gap-1 mb-0.5">
            <CheckCircle2 className="w-3 h-3 text-primary" />
            <span className="text-[9px] text-primary font-medium">Di keranjang</span>
          </div>
        )}
        <p className={cn("font-semibold text-foreground leading-tight line-clamp-2", compact ? "text-[10px]" : "text-[11px]")}>{label}</p>
        <p className="text-[9px] text-muted-foreground font-mono tracking-wide truncate">{unit.imei}</p>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
            {warrantyLabel}
          </span>
          <span className={cn(
            "text-[9px] font-medium px-1.5 py-0.5 rounded-full",
            isNoMinus
              ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
              : "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
          )}>
            {isNoMinus ? "No Minus" : `Minus ${unit.minus_severity ?? ""}`}
          </span>
        </div>
        <p className="text-xs font-bold text-foreground tabular-nums">
          {formatCurrency(unit.selling_price)}
        </p>
      </div>

      {/* Add button — always visible */}
      {!inCart ? (
        <Button
          size="sm"
          className={cn("w-full gap-1 mt-auto", compact ? "h-6 text-[10px]" : "h-7 text-[11px]")}
          onClick={e => { e.stopPropagation(); onAdd(unit); }}
        >
          <Plus className="w-3 h-3" />
          Tambah
        </Button>
      ) : !compact ? (
        <div className="flex items-center justify-center gap-1 text-[10px] text-primary font-medium h-7">
          <CheckCircle2 className="w-3 h-3" />
          Di keranjang
        </div>
      ) : null}
    </div>
  );
}

// ── Cart Item Row (accordion) ─────────────────────────────────────────────────
function CartItemRow({ item, onRemove, onToggle }: {
  item: CartItem;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const isMinus = item.unit.condition_status === "minus";

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="flex items-center gap-2.5 p-2.5">
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Smartphone className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground leading-tight truncate">{item.label}</p>
          <p className="text-[9px] text-muted-foreground font-mono mt-0.5 truncate">{item.unit.imei}</p>
          <p className="text-xs font-bold text-foreground mt-0.5">{formatCurrency(item.unit.selling_price)}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isMinus && (
            <button
              onClick={() => onToggle(item.unit.id)}
              className="w-6 h-6 rounded-md flex items-center justify-center text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors"
              title="Lihat deskripsi minus"
            >
              <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", item.expanded && "rotate-90")} />
            </button>
          )}
          <button
            onClick={() => onRemove(item.unit.id)}
            className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {isMinus && item.expanded && (
        <div className="px-2.5 pb-2.5">
          <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-2">
            <p className="text-[9px] font-semibold text-orange-700 dark:text-orange-300 uppercase tracking-wider mb-1">
              Kondisi Minus — {item.unit.minus_severity === "mayor" ? "Mayor" : "Minor"}
            </p>
            <p className="text-[10px] text-orange-700 dark:text-orange-300 leading-relaxed">
              {item.unit.minus_description ?? "Belum ada laporan minus."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Dropdown Filter Component ─────────────────────────────────────────────────
function FilterDropdown<T extends string>({
  value,
  onChange,
  options,
  icon: Icon,
}: {
  value: T;
  onChange: (val: T) => void;
  options: { value: T; label: string }[];
  icon?: React.ElementType;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "h-8 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap",
          value !== options[0]?.value
            ? "border-primary bg-primary/5 text-primary"
            : "border-border bg-card text-muted-foreground hover:text-foreground"
        )}
      >
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {selected?.label ?? "—"}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
          <div className="p-1">
            {options.map(opt => (
              <button
                key={opt.value}
                className={cn("w-full text-left px-3 py-2 text-xs rounded-lg transition-colors", value === opt.value ? "bg-accent font-medium" : "hover:bg-accent")}
                onClick={() => { onChange(opt.value); setOpen(false); }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function POSPage() {
  const { role, user, activeBranch } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const [cartTab, setCartTab] = useState<CartTab>("keranjang");

  // Branch selection
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = useState(false);
  const branchRef = useRef<HTMLDivElement>(null);

  // Product list
  const [units, setUnits] = useState<StockUnit[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [search, setSearch] = useState("");
  const [filterSeries, setFilterSeries] = useState("all");
  const [filterWarranty, setFilterWarranty] = useState<WarrantyFilter>("all");
  const [filterCondition, setFilterCondition] = useState<ConditionFilter>("all");
  const [allSeries, setAllSeries] = useState<string[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer
  const [customerType, setCustomerType] = useState<CustomerType>("guest");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regCustomer, setRegCustomer] = useState<{ id: string; name: string; email: string } | null>(null);
  const [lookingUpCustomer, setLookingUpCustomer] = useState(false);

  // Payment
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("manual");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>("");
  const [selectedTripayChannel, setSelectedTripayChannel] = useState<string>("");

  // Discount
  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<DiscountCode | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  // Transaction
  const [processingTx, setProcessingTx] = useState(false);

  // TriPay channels
  const TRIPAY_CHANNELS = [
    { code: "BCAVA", name: "BCA Virtual Account", fee: "Rp 5.500" },
    { code: "BNIVA", name: "BNI Virtual Account", fee: "Rp 4.250" },
    { code: "BRIVA", name: "BRI Virtual Account", fee: "Rp 4.250" },
    { code: "MANDIRIVA", name: "Mandiri Virtual Account", fee: "Rp 4.250" },
    { code: "PERMATAVA", name: "Permata Virtual Account", fee: "Rp 4.250" },
    { code: "CIMBVA", name: "CIMB Niaga Virtual Account", fee: "Rp 4.250" },
    { code: "BSIVA", name: "BSI Virtual Account", fee: "Rp 4.250" },
    { code: "OCBCVA", name: "OCBC NISP Virtual Account", fee: "Rp 4.250" },
    { code: "DANAMONVA", name: "Danamon Virtual Account", fee: "Rp 4.250" },
    { code: "MUAMALATVA", name: "Muamalat Virtual Account", fee: "Rp 4.250" },
    { code: "OTHERBANKVA", name: "Other Bank Virtual Account", fee: "Rp 4.250" },
    { code: "QRIS2", name: "QRIS", fee: "Rp 750 + 0,7%" },
    { code: "QRISC", name: "QRIS (Customizable)", fee: "Rp 750 + 0,7%" },
    { code: "OVO", name: "OVO", fee: "3%" },
    { code: "DANA", name: "DANA", fee: "3%" },
    { code: "SHOPEEPAY", name: "ShopeePay", fee: "3%" },
    { code: "ALFAMART", name: "Alfamart", fee: "Rp 3.500" },
    { code: "INDOMARET", name: "Indomaret", fee: "Rp 3.500" },
    { code: "ALFAMIDI", name: "Alfamidi", fee: "Rp 3.500" },
  ];

  // ── Init branch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (role === "super_admin") {
      supabase
        .from("branches")
        .select("id, name, code")
        .eq("is_active", true)
        .order("name")
        .then(({ data }) => {
          const bs = (data as Branch[]) ?? [];
          setAllBranches(bs);
          if (!selectedBranch && bs.length > 0) {
            setSelectedBranch(activeBranch as Branch ?? bs[0]);
          }
        });
    } else {
      if (activeBranch && !selectedBranch) {
        setSelectedBranch(activeBranch as Branch);
      }
    }
  }, [role, activeBranch]);

  // ── Fetch payment methods ──────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedBranch?.id) return;
    supabase
      .from("payment_methods" as never)
      .select("id, name, type, bank_name, account_number, account_name")
      .eq("branch_id", selectedBranch.id)
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        setPaymentMethods((data as PaymentMethod[]) ?? []);
        setSelectedPaymentId("");
      });
  }, [selectedBranch]);

  // ── Fetch series ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase
      .from("master_products")
      .select("series")
      .is("deleted_at", null)
      .eq("is_active", true)
      .then(({ data }) => {
        if (data) {
          const unique = Array.from(new Set(data.map((d: { series: string }) => d.series))).sort() as string[];
          setAllSeries(unique);
        }
      });
  }, []);

  // ── Close branch dropdown on outside click ─────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (branchRef.current && !branchRef.current.contains(e.target as Node)) setBranchDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Fetch units ───────────────────────────────────────────────────────────
  const fetchUnits = useCallback(async () => {
    if (!selectedBranch?.id) return;
    setLoadingUnits(true);
    let query = supabase
      .from("stock_units")
      .select("id, imei, selling_price, condition_status, minus_severity, minus_description, stock_status, branch_id, master_products(series, storage_gb, color, warranty_type, category)")
      .eq("stock_status", "available")
      .eq("branch_id", selectedBranch.id)
      .order("received_at", { ascending: false });

    // Condition filter at DB level
    if (filterCondition === "no_minus") query = query.eq("condition_status", "no_minus" as never);
    if (filterCondition === "minus_minor") {
      query = query.eq("condition_status", "minus" as never).eq("minus_severity", "minor" as never);
    }
    if (filterCondition === "minus_mayor") {
      query = query.eq("condition_status", "minus" as never).eq("minus_severity", "mayor" as never);
    }

    const { data } = await query;
    let filtered = (data as StockUnit[]) ?? [];

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(u => {
        const mp = getMasterProduct(u);
        return (
          u.imei?.toLowerCase().includes(q) ||
          mp?.series?.toLowerCase().includes(q) ||
          mp?.color?.toLowerCase().includes(q) ||
          mp?.storage_gb?.toString().includes(q)
        );
      });
    }

    if (filterSeries !== "all") {
      filtered = filtered.filter(u => getMasterProduct(u)?.series?.toLowerCase().includes(filterSeries.toLowerCase()));
    }

    if (filterWarranty !== "all") {
      filtered = filtered.filter(u => getMasterProduct(u)?.warranty_type === filterWarranty);
    }

    setUnits(filtered);
    setLoadingUnits(false);
  }, [search, filterSeries, filterWarranty, filterCondition, selectedBranch]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // ── Cart actions ──────────────────────────────────────────────────────────
  const addToCart = (unit: StockUnit) => {
    // Toggle: if already in cart, remove it
    if (cart.find(c => c.unit.id === unit.id)) {
      setCart(prev => prev.filter(c => c.unit.id !== unit.id));
      return;
    }
    setCart(prev => [...prev, { unit, label: productLabel(unit), expanded: false }]);
    // Only show toast on desktop, auto-dismiss after 1 second, bottom-left
    if (!isMobile) {
      sonnerToast.success(productLabel(unit), {
        description: "Ditambahkan ke keranjang",
        position: "bottom-left",
        duration: 1000,
      });
    }
  };

  const removeFromCart = (unitId: string) => {
    setCart(prev => prev.filter(c => c.unit.id !== unitId));
  };

  const toggleCartItem = (unitId: string) => {
    setCart(prev => prev.map(c => c.unit.id === unitId ? { ...c, expanded: !c.expanded } : c));
  };

  // ── Customer lookup ──────────────────────────────────────────────────────
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; email: string; phone: string | null }>>([]);
  const [showResults, setShowResults] = useState(false);

  const lookupCustomer = async () => {
    if (!regEmail.trim() || regEmail.trim().length < 2) return;
    setLookingUpCustomer(true);
    setSearchResults([]);
    setShowResults(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-customer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: "search_customers", keyword: regEmail.trim() }),
        }
      );
      const json = await res.json();
      if (json.customers && json.customers.length > 0) {
        setSearchResults(json.customers);
        setShowResults(true);
      } else {
        toast({ title: "Customer tidak ditemukan", description: "Tidak ada akun customer yang cocok.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Gagal mencari customer", variant: "destructive" });
    } finally {
      setLookingUpCustomer(false);
    }
  };

  const selectCustomer = (c: { id: string; name: string; email: string }) => {
    setRegCustomer(c);
    setShowResults(false);
    setSearchResults([]);
  };

  // ── Discount ──────────────────────────────────────────────────────────────
  const applyDiscount = async () => {
    if (!discountCodeInput.trim()) return;
    setApplyingDiscount(true);
    const { data } = await supabase
      .from("discount_codes")
      .select("id, code, discount_type, discount_percent, discount_amount, min_purchase_amount, applies_to_all")
      .eq("code", discountCodeInput.trim().toUpperCase())
      .eq("is_active", true)
      .single();
    setApplyingDiscount(false);
    if (!data) { toast({ title: "Kode diskon tidak valid", variant: "destructive" }); return; }
    const disc = data as DiscountCode;
    if (disc.min_purchase_amount && subtotal < disc.min_purchase_amount) {
      toast({ title: "Minimum pembelian tidak terpenuhi", description: `Minimum ${formatCurrency(disc.min_purchase_amount)}`, variant: "destructive" });
      return;
    }
    setAppliedDiscount(disc);
    toast({ title: "Kode diskon berhasil diterapkan!" });
  };

  const removeDiscount = () => { setAppliedDiscount(null); setDiscountCodeInput(""); };

  // ── Pricing ───────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((sum, c) => sum + (c.unit.selling_price ?? 0), 0);
  const discountAmount = (() => {
    if (!appliedDiscount) return 0;
    if (appliedDiscount.discount_type === "percentage" && appliedDiscount.discount_percent)
      return Math.round((subtotal * appliedDiscount.discount_percent) / 100);
    if (appliedDiscount.discount_type === "fixed_amount" && appliedDiscount.discount_amount)
      return appliedDiscount.discount_amount;
    return 0;
  })();
  const total = Math.max(0, subtotal - discountAmount);
  const selectedPayment = paymentMethods.find(p => p.id === selectedPaymentId);

  // ── Validation ────────────────────────────────────────────────────────────
  const canProceed = () => {
    if (cart.length === 0) return false;
    if (paymentMode === "manual" && !selectedPaymentId) return false;
    if (paymentMode === "online" && !selectedTripayChannel) return false;
    if (customerType === "guest" && !guestName.trim()) return false;
    if (customerType === "registered" && !regCustomer) return false;
    return true;
  };

  // ── Create transaction ────────────────────────────────────────────────────
  const createTransaction = async () => {
    if (!selectedBranch?.id || !user?.id) return;
    setProcessingTx(true);

    const code = `TRX-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Date.now().toString().slice(-4)}`;

    // ── TriPay online mode ────────────────────────────────────────────────
    if (paymentMode === "online") {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tripay-create-transaction`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({
              transactionCode: code,
              total,
              customerName: customerType === "registered" && regCustomer ? regCustomer.name : guestName,
              customerEmail: customerType === "registered" && regCustomer ? regCustomer.email : (guestEmail || undefined),
              customerPhone: guestPhone || undefined,
              items: cart.map(c => ({ label: c.label, price: c.unit.selling_price ?? 0 })),
              paymentMethod: selectedTripayChannel,
            }),
          }
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.error ?? "Gagal membuat tagihan TriPay");

        const { data: tx, error: txErr } = await supabase
          .from("transactions" as never)
          .insert({
            branch_id: selectedBranch.id,
            transaction_code: code,
            status: "pending",
            customer_user_id: customerType === "registered" && regCustomer ? regCustomer.id : null,
            customer_name: customerType === "registered" && regCustomer ? regCustomer.name : guestName,
            customer_email: customerType === "registered" && regCustomer ? regCustomer.email : (guestEmail || null),
            customer_phone: guestPhone || null,
            payment_method_name: `TriPay - ${TRIPAY_CHANNELS.find(c => c.code === selectedTripayChannel)?.name ?? selectedTripayChannel}`,
            discount_code: appliedDiscount?.code ?? null,
            discount_amount: discountAmount,
            subtotal,
            total,
            created_by: user.id,
          } as never)
          .select("id")
          .single();

        if (txErr || !tx) throw txErr ?? new Error("Gagal menyimpan transaksi");
        const txData = tx as { id: string };

        for (const item of cart) {
          await supabase.from("transaction_items" as never).insert({
            transaction_id: txData.id,
            stock_unit_id: item.unit.id,
            imei: item.unit.imei,
            product_label: item.label,
            selling_price: item.unit.selling_price ?? 0,
          } as never);
          await supabase
            .from("stock_units")
            .update({ stock_status: "reserved", sold_reference_id: txData.id })
            .eq("id", item.unit.id);
        }

        resetForm();
        setProcessingTx(false);
        navigate(`/admin/transaksi/${txData.id}`);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal membuat tagihan TriPay";
        toast({ title: "TriPay Error", description: msg, variant: "destructive" });
        setProcessingTx(false);
        return;
      }
    }

    // ── Manual payment flow → create as pending, redirect to detail ──────
    try {
      const { data: tx, error: txErr } = await supabase
        .from("transactions" as never)
        .insert({
          branch_id: selectedBranch.id,
          transaction_code: code,
          status: "pending",
          customer_user_id: customerType === "registered" && regCustomer ? regCustomer.id : null,
          customer_name: customerType === "registered" && regCustomer ? regCustomer.name : guestName,
          customer_email: customerType === "registered" && regCustomer ? regCustomer.email : (guestEmail || null),
          customer_phone: customerType === "guest" ? (guestPhone || null) : null,
          payment_method_id: selectedPaymentId || null,
          payment_method_name: selectedPayment?.name ?? null,
          discount_code: appliedDiscount?.code ?? null,
          discount_amount: discountAmount,
          subtotal,
          total,
          created_by: user.id,
        } as never)
        .select("id")
        .single();

      if (txErr || !tx) throw txErr ?? new Error("Gagal membuat transaksi");
      const txData = tx as { id: string };

      for (const item of cart) {
        await supabase.from("transaction_items" as never).insert({
          transaction_id: txData.id,
          stock_unit_id: item.unit.id,
          imei: item.unit.imei,
          product_label: item.label,
          selling_price: item.unit.selling_price ?? 0,
        } as never);

        await supabase
          .from("stock_units")
          .update({ stock_status: "reserved", sold_reference_id: txData.id })
          .eq("id", item.unit.id);
      }

      resetForm();
      navigate(`/admin/transaksi/${txData.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses transaksi";
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    } finally {
      setProcessingTx(false);
    }
  };

  const resetForm = () => {
    setCart([]);
    setGuestName(""); setGuestEmail(""); setGuestPhone(""); setRegEmail(""); setRegCustomer(null);
    setAppliedDiscount(null); setDiscountCodeInput(""); setSelectedPaymentId(""); setSelectedTripayChannel("");
  };

  const cartUnitIds = new Set(cart.map(c => c.unit.id));

  // ── Series options ────────────────────────────────────────────────────────
  const seriesOptions = [
    { value: "all", label: "Semua Seri" },
    ...allSeries.map(s => ({ value: s, label: s })),
  ];

  const warrantyOptions: { value: WarrantyFilter; label: string }[] = [
    { value: "all", label: "Semua Tipe" },
    { value: "ibox", label: "Resmi iBox" },
    { value: "resmi_bc", label: "Resmi BC" },
    { value: "inter", label: "Inter" },
    { value: "whitelist", label: "Whitelist" },
    { value: "digimap", label: "Digimap" },
  ];

  const conditionOptions: { value: ConditionFilter; label: string }[] = [
    { value: "all", label: "Semua Kondisi" },
    { value: "no_minus", label: "No Minus" },
    { value: "minus_minor", label: "Minus Minor" },
    { value: "minus_mayor", label: "Minus Mayor" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout pageTitle="POS — Point of Sale">
      <div className={cn("flex gap-4 overflow-hidden", isMobile ? "flex-col h-[calc(100vh-80px)] -mt-2" : "h-[calc(100vh-80px)] -mt-2")}>

        {/* ══ LEFT PANEL: hidden on mobile ══════════════════════════════════ */}
        {!isMobile && (
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            {/* Header */}
            <div className="shrink-0 mb-3">
              <h1 className="text-base font-semibold text-foreground">Daftar Unit Tersedia</h1>
              <p className="text-xs text-muted-foreground">Klik unit untuk tambah ke keranjang. Gunakan barcode scanner untuk cari IMEI.</p>
            </div>

            {/* Search bar */}
            <div className="shrink-0 relative mb-2">
              <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && fetchUnits()}
                placeholder="Cari IMEI, seri, warna… atau scan barcode"
                className="pl-9 pr-9 h-10 text-sm"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* ─ Filter dropdowns ─ */}
            <div className="shrink-0 mb-2 flex items-center gap-2 flex-wrap">
              <FilterDropdown
                value={filterSeries}
                onChange={setFilterSeries}
                options={seriesOptions}
                icon={Smartphone}
              />
              <FilterDropdown
                value={filterWarranty}
                onChange={(v: WarrantyFilter) => setFilterWarranty(v)}
                options={warrantyOptions}
                icon={Filter}
              />
              <FilterDropdown
                value={filterCondition}
                onChange={(v: ConditionFilter) => setFilterCondition(v)}
                options={conditionOptions}
                icon={AlertCircle}
              />
              <button
                onClick={() => fetchUnits()}
                className="h-8 w-8 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0"
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Count */}
            <p className="shrink-0 text-[11px] text-muted-foreground mb-2">
              {loadingUnits ? "Memuat..." : `${units.length} unit tersedia`}
            </p>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              {loadingUnits ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                  {[...Array(10)].map((_, i) => <div key={i} className="h-52 bg-muted rounded-xl animate-pulse" />)}
                </div>
              ) : units.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Smartphone className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Tidak ada unit tersedia</p>
                    <p className="text-xs text-muted-foreground">Coba ubah filter atau scan IMEI lain</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 pb-4">
                  {units.map(unit => (
                    <ProductCard
                      key={unit.id}
                      unit={unit}
                      onAdd={addToCart}
                      inCart={cartUnitIds.has(unit.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ RIGHT PANEL: Cart & Checkout — full width on mobile ════════════ */}
        <div className={cn(
          "flex flex-col overflow-hidden bg-card border border-border rounded-2xl",
          isMobile ? "flex-1 w-full min-h-0" : "w-[340px] shrink-0"
        )}>

          {/* Branch selector */}
          <div className="shrink-0 px-4 pt-3 pb-2 border-b border-border">
            {role === "super_admin" ? (
              <div className="relative" ref={branchRef}>
                <button
                  onClick={() => setBranchDropdownOpen(!branchDropdownOpen)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors"
                >
                  <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="flex-1 text-left text-xs font-medium text-foreground truncate">
                    {selectedBranch?.name ?? "Pilih Cabang"}
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                </button>
                {branchDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-lg z-50 max-h-52 overflow-y-auto">
                    <div className="p-1">
                      {allBranches.map(b => (
                        <button
                          key={b.id}
                          onClick={() => { setSelectedBranch(b); setBranchDropdownOpen(false); }}
                          className={cn(
                            "w-full text-left flex items-center gap-2 px-3 py-2 text-xs rounded-lg transition-colors",
                            selectedBranch?.id === b.id ? "bg-accent font-medium" : "hover:bg-accent"
                          )}
                        >
                          <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="flex-1 truncate">{b.name}</span>
                          <span className="text-[9px] text-muted-foreground font-mono">{b.code}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/40">
                <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="text-xs font-medium text-foreground truncate">{selectedBranch?.name ?? "—"}</span>
              </div>
            )}
          </div>

          {/* ── Tab Bar ── */}
          <div className="shrink-0 flex border-b border-border">
            {(["keranjang", "pelanggan", "pembayaran"] as CartTab[]).map(tab => {
              const labels: Record<CartTab, string> = { keranjang: "Keranjang", pelanggan: "Pelanggan", pembayaran: "Pembayaran" };
              const icons: Record<CartTab, React.ReactNode> = {
                keranjang: <ShoppingCart className="w-3 h-3" />,
                pelanggan: <User className="w-3 h-3" />,
                pembayaran: <CreditCard className="w-3 h-3" />,
              };
              const hasError = tab === "pelanggan" && cart.length > 0 && customerType === "guest" && !guestName.trim();
              const hasError2 = tab === "pelanggan" && cart.length > 0 && customerType === "registered" && !regCustomer;
              const showDot = hasError || hasError2;
              return (
                <button
                  key={tab}
                  onClick={() => setCartTab(tab)}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-medium transition-colors relative",
                    cartTab === tab
                      ? "text-primary border-b-2 border-primary bg-primary/5"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  {icons[tab]}
                  {labels[tab]}
                  {tab === "keranjang" && cart.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                      {cart.length}
                    </span>
                  )}
                  {showDot && (
                    <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-destructive" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Tab Content ── */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">

            {/* ──── TAB: Keranjang ──── */}
            {cartTab === "keranjang" && (
              <div className="h-full flex flex-col">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center px-6 py-12">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                      <ShoppingCart className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Keranjang kosong</p>
                      <p className="text-xs text-muted-foreground">
                        {isMobile ? "Ketuk + untuk pilih produk" : "Pilih unit dari daftar sebelah kiri"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="px-3 py-3 space-y-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-muted-foreground">{cart.length} item dipilih</p>
                      <button onClick={() => setCart([])} className="text-[10px] text-destructive hover:underline">
                        Kosongkan
                      </button>
                    </div>
                    {cart.map(item => (
                      <CartItemRow
                        key={item.unit.id}
                        item={item}
                        onRemove={removeFromCart}
                        onToggle={toggleCartItem}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ──── TAB: Pelanggan ──── */}
            {cartTab === "pelanggan" && (
              <div className="px-4 py-4 space-y-4">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Tipe Pelanggan</p>
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setCustomerType("guest")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors",
                      customerType === "guest" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <User className="w-3 h-3" />
                    Tanpa Akun
                  </button>
                  <button
                    onClick={() => setCustomerType("registered")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors",
                      customerType === "registered" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <UserCheck className="w-3 h-3" />
                    Punya Akun
                  </button>
                </div>

                {customerType === "guest" ? (
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground">Nama Pembeli *</label>
                      <Input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Nama pembeli" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground">Email (opsional)</label>
                      <Input value={guestEmail} onChange={e => setGuestEmail(e.target.value)} placeholder="Email pembeli" type="email" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground">No. HP (opsional)</label>
                      <Input value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="08xxxxxxxxxx" type="tel" className="h-9 text-sm" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-medium text-muted-foreground">Cari Nama / Email / No. HP</label>
                      <div className="flex gap-2">
                        <Input
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && lookupCustomer()}
                          placeholder="Nama, email, atau no. HP"
                          className="h-9 text-sm flex-1"
                        />
                        <Button size="sm" variant="outline" className="h-9 px-3 shrink-0" onClick={lookupCustomer} disabled={lookingUpCustomer || regEmail.trim().length < 2}>
                          {lookingUpCustomer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>

                    {/* Search results list */}
                    {showResults && searchResults.length > 0 && !regCustomer && (
                      <div className="border border-border rounded-xl overflow-hidden divide-y divide-border max-h-48 overflow-y-auto">
                        {searchResults.map(c => (
                          <button
                            key={c.id}
                            onClick={() => selectCustomer(c)}
                            className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors"
                          >
                            <p className="text-xs font-semibold text-foreground">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">{c.email}</p>
                            {c.phone && <p className="text-[10px] text-muted-foreground">{c.phone}</p>}
                          </button>
                        ))}
                      </div>
                    )}

                    {regCustomer && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                        <UserCheck className="w-4 h-4 text-green-700 dark:text-green-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-green-700 dark:text-green-300 truncate">{regCustomer.name}</p>
                          <p className="text-[11px] text-green-600 dark:text-green-400 truncate">{regCustomer.email}</p>
                        </div>
                        <button onClick={() => { setRegCustomer(null); setRegEmail(""); setShowResults(false); setSearchResults([]); }}>
                          <X className="w-3.5 h-3.5 text-green-700 dark:text-green-300" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ──── TAB: Pembayaran ──── */}
            {cartTab === "pembayaran" && (
              <div className="px-4 py-4 space-y-4">

                {/* Kode Diskon */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Kode Diskon</p>
                  {!appliedDiscount ? (
                    <div className="flex gap-2">
                      <Input
                        value={discountCodeInput}
                        onChange={e => setDiscountCodeInput(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === "Enter" && applyDiscount()}
                        placeholder="Kode promo"
                        className="h-9 text-sm font-mono flex-1"
                      />
                      <Button size="sm" variant="outline" className="h-9 px-3 shrink-0" onClick={applyDiscount} disabled={applyingDiscount || !discountCodeInput}>
                        {applyingDiscount ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Tag className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                      <Tag className="w-3.5 h-3.5 text-blue-700 dark:text-blue-300 shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 font-mono">{appliedDiscount.code}</p>
                        <p className="text-[10px] text-blue-600 dark:text-blue-400">Hemat {formatCurrency(discountAmount)}</p>
                      </div>
                      <button onClick={removeDiscount}><X className="w-3 h-3 text-blue-700 dark:text-blue-300" /></button>
                    </div>
                  )}
                </div>

                {/* Mode Pembayaran */}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mode Pembayaran</p>
                  <div className="flex rounded-lg border border-border overflow-hidden">
                    <button
                      onClick={() => { setPaymentMode("manual"); setSelectedTripayChannel(""); }}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors",
                        paymentMode === "manual"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Hand className="w-3 h-3" />
                      Manual
                    </button>
                    <button
                      onClick={() => { setPaymentMode("online"); setSelectedPaymentId(""); }}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors",
                        paymentMode === "online"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted"
                      )}
                    >
                      <Zap className="w-3 h-3" />
                      TriPay
                    </button>
                  </div>
                </div>

                {/* Metode (manual) — grouped by type */}
                {paymentMode === "manual" && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Metode Pembayaran</p>
                    {paymentMethods.length === 0 ? (
                      <div className="p-3 rounded-xl border border-border bg-muted/50 text-center">
                        <p className="text-[11px] text-muted-foreground">Belum ada metode.</p>
                        <p className="text-[10px] text-muted-foreground">Tambahkan di Kanal Pembayaran.</p>
                      </div>
                    ) : (
                      (() => {
                        const typeOrder = ["cash", "bank_transfer", "ewallet", "other"];
                        const typeLabel: Record<string, string> = {
                          cash: "Tunai",
                          bank_transfer: "Transfer Bank",
                          ewallet: "E-Wallet",
                          other: "Lainnya",
                        };
                        const groups = typeOrder
                          .map(t => ({ type: t, label: typeLabel[t], items: paymentMethods.filter(p => p.type === t) }))
                          .filter(g => g.items.length > 0);

                        return (
                          <div className="space-y-3">
                            {groups.map(group => {
                              const GroupIcon = PAYMENT_TYPE_ICON[group.type] ?? CreditCard;
                              return (
                                <div key={group.type}>
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    <GroupIcon className="w-3 h-3 text-muted-foreground" />
                                    <p className="text-[10px] font-semibold text-muted-foreground">{group.label}</p>
                                  </div>
                                  <div className="space-y-1.5 pl-0">
                                    {group.items.map(pm => (
                                      <button
                                        key={pm.id}
                                        onClick={() => setSelectedPaymentId(pm.id)}
                                        className={cn(
                                          "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all",
                                          selectedPaymentId === pm.id
                                            ? "border-primary bg-primary/5"
                                            : "border-border hover:border-primary/40 hover:bg-muted/40"
                                        )}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-foreground truncate">
                                            {pm.bank_name ?? pm.name}
                                          </p>
                                          {pm.account_number && (
                                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                                              {pm.account_number}{pm.account_name ? ` · ${pm.account_name}` : ""}
                                            </p>
                                          )}
                                        </div>
                                        {selectedPaymentId === pm.id && (
                                          <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}

                {/* TriPay Channel Selection */}
                {paymentMode === "online" && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Pilih Channel TriPay</p>
                    {total > 10_000_000 && (
                      <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                        <p className="text-[10px] text-orange-700 dark:text-orange-300 font-medium">
                          ⚠ Total melebihi Rp 10 jt — akan dibagi beberapa pembayaran terpisah.
                        </p>
                      </div>
                    )}
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {TRIPAY_CHANNELS.map(ch => (
                        <button
                          key={ch.code}
                          onClick={() => setSelectedTripayChannel(ch.code)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all",
                            selectedTripayChannel === ch.code
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/40"
                          )}
                        >
                          <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{ch.name}</p>
                            <p className="text-[10px] text-muted-foreground">Biaya: {ch.fee}</p>
                          </div>
                          {selectedTripayChannel === ch.code && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Footer: price summary + CTA ── */}
          {cart.length > 0 && (
            <div className="shrink-0 border-t border-border px-4 py-3 space-y-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Subtotal ({cart.length} item)</span>
                  <span className="font-medium text-foreground tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-600 dark:text-blue-400">Diskon ({appliedDiscount?.code})</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400 tabular-nums">-{formatCurrency(discountAmount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-border/50">
                  <span className="text-sm font-bold text-foreground">Total</span>
                  <span className="text-base font-bold text-foreground tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>

              <Button
                className="w-full h-10 text-sm gap-2"
                disabled={!canProceed() || processingTx}
                onClick={createTransaction}
              >
                {processingTx ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Memproses…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Buat Transaksi</>
                )}
              </Button>

              {!canProceed() && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {cart.length === 0
                    ? "Tambahkan unit ke keranjang"
                    : paymentMode === "manual" && !selectedPaymentId
                      ? "Pilih metode pembayaran"
                      : paymentMode === "online" && !selectedTripayChannel
                        ? "Pilih channel TriPay"
                        : customerType === "guest" && !guestName
                          ? "Isi nama pembeli di tab Pelanggan"
                          : "Verifikasi data customer di tab Pelanggan"}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ Mobile FAB: small circle plus icon on the LEFT ═══════════════════ */}
      {isMobile && (
        <button
          onClick={() => setMobileProductsOpen(true)}
          className="fixed bottom-20 left-4 z-30 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="Pilih Produk"
        >
          <Plus className="w-5 h-5" />
          {cart.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </button>
      )}

      {/* ══ Mobile Product Picker Overlay ════════════════════════════════════ */}
      {isMobile && mobileProductsOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setMobileProductsOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "90vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div>
                <p className="text-sm font-semibold text-foreground">Pilih Produk</p>
                <p className="text-[11px] text-muted-foreground">{units.length} unit tersedia</p>
              </div>
              <button
                onClick={() => setMobileProductsOpen(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Search & filters */}
            <div className="px-3 pt-3 space-y-2 shrink-0">
              <div className="relative">
                <ScanLine className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Cari IMEI, seri, warna…"
                  className="pl-9 h-9 text-sm"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Dropdown filters in a row */}
              <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                <FilterDropdown
                  value={filterWarranty}
                  onChange={(v: WarrantyFilter) => setFilterWarranty(v)}
                  options={warrantyOptions}
                  icon={Filter}
                />
                <FilterDropdown
                  value={filterCondition}
                  onChange={(v: ConditionFilter) => setFilterCondition(v)}
                  options={conditionOptions}
                  icon={AlertCircle}
                />
                <button
                  onClick={() => fetchUnits()}
                  className="h-8 w-8 rounded-lg border border-border bg-card text-muted-foreground flex items-center justify-center shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Product grid */}
            <div className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
              {loadingUnits ? (
                <div className="grid grid-cols-2 gap-2">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}
                </div>
              ) : units.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Smartphone className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Tidak ada unit tersedia</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {units.map(unit => (
                    <ProductCard
                      key={unit.id}
                      unit={unit}
                      onAdd={addToCart}
                      inCart={cartUnitIds.has(unit.id)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Done button */}
            <div className="px-4 pb-6 pt-2 border-t border-border shrink-0">
              <Button className="w-full gap-2" onClick={() => setMobileProductsOpen(false)}>
                <CheckCircle2 className="w-4 h-4" />
                Selesai Pilih ({cart.length} item)
              </Button>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
