import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, RefreshCw,
  Smartphone, CreditCard, Zap, ExternalLink, Building2,
  Copy, Package, Loader2, MapPin, Truck, ShoppingBag,
} from "lucide-react";
import { supabaseCustomer } from "@/integrations/supabase/customer-client";
import { useCustomerAuth } from "@/contexts/CustomerAuthContext";
import { PublicNavbar } from "@/components/layout/PublicNavbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocale } from "@/contexts/LocaleContext";

const USD_RATE = 15500;

interface Transaction {
  id: string;
  transaction_code: string | null;
  status: string;
  subtotal: number;
  discount_amount: number;
  total: number;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  payment_method_name: string | null;
  discount_code: string | null;
  created_at: string;
  shipping_cost: number | null;
  shipping_courier: string | null;
  shipping_service: string | null;
  shipping_etd: string | null;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  shipping_district: string | null;
  shipping_postal_code: string | null;
  shipping_discount: number | null;
}

interface TransactionItem {
  id: string;
  imei: string;
  product_label: string;
  selling_price: number;
}

interface TripayTransaction {
  reference: string;
  payment_name: string;
  amount: number;
  pay_code: string | null;
  checkout_url: string | null;
  status: string;
  paid_at: number | null;
  expired_at: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; bg: string }> = {
  pending: { label: "Menunggu Pembayaran", color: "text-amber-600", icon: Clock, bg: "bg-amber-50 border-amber-200" },
  completed: { label: "Selesai", color: "text-green-600", icon: CheckCircle2, bg: "bg-green-50 border-green-200" },
  cancelled: { label: "Dibatalkan", color: "text-destructive", icon: XCircle, bg: "bg-destructive/5 border-destructive/20" },
  failed: { label: "Gagal", color: "text-destructive", icon: XCircle, bg: "bg-destructive/5 border-destructive/20" },
  refunded: { label: "Dikembalikan", color: "text-muted-foreground", icon: RefreshCw, bg: "bg-muted/40 border-muted" },
};

const TRIPAY_STATUS: Record<string, { label: string; color: string }> = {
  UNPAID: { label: "Belum Dibayar", color: "text-amber-600" },
  PAID: { label: "Sudah Dibayar", color: "text-green-600" },
  EXPIRED: { label: "Kadaluarsa", color: "text-destructive" },
  FAILED: { label: "Gagal", color: "text-destructive" },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatExpiry(unix: number) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
  }) + " WIB";
}

export default function CustomerTransaksiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useCustomerAuth();
  const { currency } = useLocale();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [tripayTxs, setTripayTxs] = useState<TripayTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const formatPrice = (n: number) => {
    if (currency === "USD") return "$" + (n / USD_RATE).toLocaleString("en-US", { maximumFractionDigits: 0 });
    return "Rp" + n.toLocaleString("id-ID");
  };

  const fetchTransaction = useCallback(async () => {
    if (!id || !user) return;
    const { data: tx } = await supabaseCustomer
      .from("transactions")
      .select("*")
      .eq("id", id)
      .eq("customer_user_id", user.id)
      .single();

    if (!tx) { setLoading(false); return; }
    setTransaction(tx as Transaction);

    const { data: txItems } = await supabaseCustomer
      .from("transaction_items")
      .select("id, imei, product_label, selling_price")
      .eq("transaction_id", id);
    setItems((txItems as TransactionItem[]) ?? []);

    setLoading(false);
  }, [id, user]);

  const fetchTripayStatus = useCallback(async (code: string) => {
    setRefreshing(true);
    try {
      const session = (await supabaseCustomer.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tripay-check-status`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ transactionCode: code, transactionId: id }),
        }
      );
      const json = await res.json();
      if (json.success && json.data) {
        setTripayTxs(json.data);
        const allPaid = json.data.every((t: TripayTransaction) => t.status === "PAID");
        if (allPaid && transaction?.status === "pending") {
          fetchTransaction();
        }
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [fetchTransaction, transaction?.status, id]);

  useEffect(() => { fetchTransaction(); }, [fetchTransaction]);

  useEffect(() => {
    if (transaction?.transaction_code && transaction.status === "pending") {
      fetchTripayStatus(transaction.transaction_code);
    }
  }, [transaction?.transaction_code, transaction?.status]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?redirect=/riwayat", { replace: true });
  }, [user, authLoading, navigate]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavbar />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavbar />
        <div className="max-w-3xl mx-auto px-4 py-12 text-center">
          <Package className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Transaksi tidak ditemukan</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate("/riwayat")}>
            Kembali
          </Button>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[transaction.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const shippingCost = transaction.shipping_cost ?? 0;
  const shippingDiscount = transaction.shipping_discount ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate("/riwayat")} className="p-2 rounded-lg hover:bg-accent transition-colors">
            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-foreground">{transaction.transaction_code || "Detail Transaksi"}</h1>
            <p className="text-xs text-muted-foreground">{formatDateTime(transaction.created_at)}</p>
          </div>
          <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold", statusCfg.bg, statusCfg.color)}>
            <StatusIcon className="w-3.5 h-3.5" />
            {statusCfg.label}
          </div>
        </div>

        <div className="space-y-4">
          {/* TriPay Payment */}
          {tripayTxs.length > 0 && transaction.status === "pending" && (
            <div className="space-y-3">
              {tripayTxs.map((tx, i) => {
                const isPaid = tx.status === "PAID";
                const isExpired = tx.status === "EXPIRED" || tx.status === "FAILED";
                const tripayStatus = TRIPAY_STATUS[tx.status] ?? TRIPAY_STATUS.UNPAID;
                return (
                  <div key={tx.reference} className={cn(
                    "rounded-xl border p-4 space-y-3",
                    isPaid ? "border-green-200 bg-green-50/50" : isExpired ? "border-destructive/20 bg-destructive/5" : "border-primary/20 bg-primary/5"
                  )}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-foreground">{tx.payment_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">{tx.reference}</p>
                      </div>
                      <span className={cn("text-[11px] font-semibold", tripayStatus.color)}>{tripayStatus.label}</span>
                    </div>

                    <div className="flex items-center justify-between py-2 border-y border-border/50">
                      <span className="text-xs text-muted-foreground">Jumlah Tagihan</span>
                      <span className="text-sm font-bold text-foreground">{formatPrice(tx.amount)}</span>
                    </div>

                    {tx.pay_code && !isPaid && !isExpired && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Nomor Virtual Account</p>
                        <div className="flex items-center gap-2 bg-background rounded-lg px-3 py-2 border border-border">
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-bold text-foreground font-mono tracking-widest flex-1">{tx.pay_code}</span>
                          <button
                            onClick={() => { navigator.clipboard.writeText(tx.pay_code!); toast({ title: "Disalin!" }); }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {tx.checkout_url && !isPaid && !isExpired && (
                      <a href={tx.checkout_url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Buka Halaman Pembayaran
                      </a>
                    )}

                    {!isPaid && !isExpired && tx.expired_at > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-amber-600">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Bayar sebelum: <span className="font-semibold">{formatExpiry(tx.expired_at)}</span></span>
                      </div>
                    )}

                    {isPaid && tx.paid_at && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <p className="text-xs">Dibayar {formatDateTime(new Date(tx.paid_at * 1000).toISOString())}</p>
                      </div>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => fetchTripayStatus(transaction.transaction_code!)} disabled={refreshing}>
                <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
                Cek Status Pembayaran
              </Button>
            </div>
          )}

          {/* Items */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> Item Pesanan
            </p>
            <div className="divide-y divide-border">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{item.product_label}</p>
                    <p className="text-xs text-muted-foreground font-mono">IMEI: {item.imei}</p>
                  </div>
                  <p className="text-sm font-bold text-foreground shrink-0 ml-3">{formatPrice(item.selling_price)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Shipping */}
          {transaction.shipping_address && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Truck className="w-4 h-4" /> Pengiriman
              </p>
              {transaction.shipping_courier && (
                <p className="text-xs text-muted-foreground">
                  {transaction.shipping_courier} {transaction.shipping_service} · Est. {transaction.shipping_etd || "-"} hari
                </p>
              )}
              <div className="flex items-start gap-2 pt-1">
                <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {transaction.shipping_address}
                  {transaction.shipping_district && `, ${transaction.shipping_district}`}
                  {transaction.shipping_city && `, ${transaction.shipping_city}`}
                  {transaction.shipping_province && `, ${transaction.shipping_province}`}
                  {transaction.shipping_postal_code && ` ${transaction.shipping_postal_code}`}
                </p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> Ringkasan Pembayaran
            </p>
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal ({items.length} item)</span>
                <span className="text-foreground">{formatPrice(transaction.subtotal)}</span>
              </div>
              {transaction.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Diskon{transaction.discount_code && ` (${transaction.discount_code})`}</span>
                  <span className="text-green-600">-{formatPrice(transaction.discount_amount)}</span>
                </div>
              )}
              {shippingCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ongkir</span>
                  <span className="text-foreground">{formatPrice(shippingCost)}</span>
                </div>
              )}
              {shippingDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Subsidi Ongkir</span>
                  <span className="text-green-600">-{formatPrice(shippingDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold pt-2 border-t border-border">
                <span className="text-foreground">Total</span>
                <span className="text-foreground">{formatPrice(transaction.total)}</span>
              </div>
            </div>
            {transaction.payment_method_name && (
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">Metode: <span className="font-medium text-foreground">{transaction.payment_method_name}</span></p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
