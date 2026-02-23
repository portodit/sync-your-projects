import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Clock, CheckCircle2, XCircle, RefreshCw, Package,
  ChevronRight, ShoppingBag, Loader2,
} from "lucide-react";
import { supabaseCustomer } from "@/integrations/supabase/customer-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

const USD_RATE = 15500;

interface Transaction {
  id: string;
  transaction_code: string | null;
  status: string;
  total: number;
  created_at: string;
  customer_name: string | null;
  payment_method_name: string | null;
  shipping_courier: string | null;
  shipping_service: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  pending: { label: "Menunggu Pembayaran", color: "text-amber-600", icon: Clock, bg: "bg-amber-50 border-amber-200" },
  completed: { label: "Selesai", color: "text-green-600", icon: CheckCircle2, bg: "bg-green-50 border-green-200" },
  cancelled: { label: "Dibatalkan", color: "text-destructive", icon: XCircle, bg: "bg-destructive/5 border-destructive/20" },
  failed: { label: "Gagal", color: "text-destructive", icon: XCircle, bg: "bg-destructive/5 border-destructive/20" },
  refunded: { label: "Dikembalikan", color: "text-muted-foreground", icon: RefreshCw, bg: "bg-muted/40 border-muted" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export default function CustomerTransaksiPage() {
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useCustomerAuth();
  const { currency } = useLocale();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const formatPrice = (n: number) => {
    if (currency === "USD") return "$" + (n / USD_RATE).toLocaleString("en-US", { maximumFractionDigits: 0 });
    return "Rp" + n.toLocaleString("id-ID");
  };

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabaseCustomer
        .from("transactions")
        .select("id, transaction_code, status, total, created_at, customer_name, payment_method_name, shipping_courier, shipping_service")
        .eq("customer_user_id", user.id)
        .order("created_at", { ascending: false });

      if (filter !== "all") query = query.eq("status", filter);

      const { data } = await query;
      setTransactions((data as Transaction[]) ?? []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?redirect=/riwayat", { replace: true });
  }, [user, authLoading, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavbar />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const filters = [
    { key: "all", label: "Semua" },
    { key: "pending", label: "Pending" },
    { key: "completed", label: "Selesai" },
    { key: "cancelled", label: "Dibatalkan" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-bold text-foreground mb-1">Riwayat Transaksi</h1>
        <p className="text-sm text-muted-foreground mb-6">{transactions.length} transaksi</p>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap",
                filter === f.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-card text-muted-foreground border-border hover:border-foreground/40"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16">
            <ShoppingBag className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Belum ada transaksi</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/katalog")}>
              Mulai Belanja
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {transactions.map(tx => {
              const statusCfg = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              return (
                <button
                  key={tx.id}
                  onClick={() => navigate(`/riwayat/${tx.id}`)}
                  className="w-full p-4 rounded-xl border border-border bg-card hover:border-foreground/30 transition-all text-left flex items-center gap-4"
                >
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 border", statusCfg.bg)}>
                    <StatusIcon className={cn("w-4 h-4", statusCfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground">{tx.transaction_code || "—"}</p>
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", statusCfg.bg, statusCfg.color)}>
                        {statusCfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(tx.created_at)} · {formatTime(tx.created_at)}
                      {tx.shipping_courier && ` · ${tx.shipping_courier} ${tx.shipping_service || ""}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground">{formatPrice(tx.total)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
